import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { CronExpressionParser } from 'cron-parser';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  IDLE_TIMEOUT,
  IPC_POLL_INTERVAL,
  MAIN_GROUP_FOLDER,
  TIMEZONE,
  TRIGGER_PATTERN,
} from './config.js';
import {
  AvailableGroup,
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  createTask,
  deleteTask,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getTaskById,
  initDatabase,
  setRegisteredGroup,
  setSession,
  updateTask,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { RegisteredGroup } from './types.js';
import { TelegramIntegration } from './telegram-integration.js';
import { logger } from './logger.js';

let telegram: TelegramIntegration | null = null;
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let ipcWatcherRunning = false;

const queue = new GroupQueue();

function loadState(): void {
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  // Placeholder — currently no ephemeral state to persist.
  // Sessions and registered groups are written to SQLite on change.
}

async function clearSessionForGroup(groupFolder: string): Promise<void> {
  const sessionId = sessions[groupFolder];
  if (!sessionId) {
    logger.debug({ groupFolder }, 'No session to clear');
    return;
  }

  // Remove session ID from memory (SQLite will be overwritten on next session start)
  delete sessions[groupFolder];

  // Delete session files
  const sessionDir = path.join(DATA_DIR, 'sessions', groupFolder, '.claude', 'projects', '-workspace-group');
  const sessionFile = path.join(sessionDir, `${sessionId}.jsonl`);
  const sessionFolder = path.join(sessionDir, sessionId);

  try {
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
      logger.debug({ sessionFile }, 'Deleted session file');
    }
    if (fs.existsSync(sessionFolder)) {
      fs.rmSync(sessionFolder, { recursive: true, force: true });
      logger.debug({ sessionFolder }, 'Deleted session folder');
    }
    logger.info({ groupFolder, sessionId }, 'Session cleared successfully');
  } catch (err) {
    logger.error({ groupFolder, sessionId, err }, 'Failed to delete session files');
    throw err;
  }
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  const groupDir = path.join(DATA_DIR, '..', 'groups', group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Get available groups list for the agent.
 * Returns all registered groups as available.
 */
function getAvailableGroups(): AvailableGroup[] {
  const registeredJids = new Set(Object.keys(registeredGroups));
  return Array.from(registeredJids).map((jid) => ({
    jid,
    name: registeredGroups[jid]?.name || jid,
    lastActivity: new Date().toISOString(),
    isRegistered: true,
  }));
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
  images?: Array<{ data: string; mediaType: 'image/jpeg' | 'image/png' }>,
  documents?: Array<{ data: string; filename: string }>
): Promise<'success' | 'error'> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessionId = sessions[group.folder];

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Wrap onOutput to track session ID from streamed results
  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  let spawnedContainerName: string | undefined;

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        images,
        documents,
      },
      (proc, containerName) => {
        spawnedContainerName = containerName;
        queue.registerProcess(chatJid, proc, containerName, group.folder);
      },
      wrappedOnOutput,
    );

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      setSession(group.folder, output.newSessionId);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  } finally {
    // Always unregister the container from the active set once it exits.
    // This covers direct callers (Telegram) that bypass the queue's runForGroup.
    if (spawnedContainerName) {
      queue.unregisterContainer(spawnedContainerName);
    }
  }
}

async function sendMessage(jid: string, text: string): Promise<void> {
  try {
    if (telegram) {
      await telegram.send(jid, text);
    } else {
      logger.error({ jid }, 'Telegram not initialized');
      return;
    }
    logger.info({ jid, length: text.length }, 'Message sent');
  } catch (err) {
    logger.error({ jid, err }, 'Failed to send message');
  }
}

function startIpcWatcher(): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    for (const sourceGroup of groupFolders) {
      const isMain = sourceGroup === MAIN_GROUP_FOLDER;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // Authorization: verify this group can send to this chatJid
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  await sendMessage(data.chatJid, data.text);
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, isMain);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    containerConfig?: RegisteredGroup['containerConfig'];
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
): Promise<void> {
  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        // Resolve the target group from JID
        const targetJid = data.targetJid as string;
        const targetGroupEntry = registeredGroups[targetJid];

        if (!targetGroupEntry) {
          logger.warn(
            { targetJid },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const targetFolder = targetGroupEntry.folder;

        // Authorization: non-main groups can only schedule for themselves
        if (!isMain && targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetFolder, contextMode },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'refresh_groups':
      // Only main group can request a refresh
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group list refresh requested via IPC',
        );
        // Reload registered groups from DB and write updated snapshot
        registeredGroups = getAllRegisteredGroups();
        const availableGroups = getAvailableGroups();
        writeGroupsSnapshot(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only main group can register new groups
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    case 'clear_session':
      if (data.groupFolder) {
        delete sessions[data.groupFolder];
        logger.info({ groupFolder: data.groupFolder, requestedBy: sourceGroup }, 'Session cleared via IPC');
      }
      break;

    default: {
      // @ts-ignore - Skill lives outside src/ rootDir
      const { handleXIpc } = await import('../.claude/skills/x-integration/host.js');
      const handled = await handleXIpc(data, sourceGroup, isMain, DATA_DIR);
      if (!handled) {
        logger.warn({ type: data.type }, 'Unknown IPC task type');
      }
    }
  }
}

function ensureContainerSystemRunning(): void {
  try {
    execSync('container system status', { stdio: 'pipe' });
    logger.debug('Apple Container system already running');
  } catch {
    logger.info('Starting Apple Container system...');
    try {
      execSync('container system start', { stdio: 'pipe', timeout: 30000 });
      logger.info('Apple Container system started');
    } catch (err) {
      logger.error({ err }, 'Failed to start Apple Container system');
      console.error(
        '\n╔════════════════════════════════════════════════════════════════╗',
      );
      console.error(
        '║  FATAL: Apple Container system failed to start                 ║',
      );
      console.error(
        '║                                                                ║',
      );
      console.error(
        '║  Agents cannot run without Apple Container. To fix:           ║',
      );
      console.error(
        '║  1. Install from: https://github.com/apple/container/releases ║',
      );
      console.error(
        '║  2. Run: container system start                               ║',
      );
      console.error(
        '║  3. Restart NanoClaw                                          ║',
      );
      console.error(
        '╚════════════════════════════════════════════════════════════════╝\n',
      );
      throw new Error('Apple Container system is required but failed to start');
    }
  }

  // Kill and clean up orphaned NanoClaw containers from previous runs
  cleanupOrphanedContainers('startup');
}

/**
 * Clean up orphaned NanoClaw containers (both running and stopped).
 * Apple Container's --rm flag is unreliable when the parent process crashes
 * or containers are killed via `container stop`. This function handles both
 * states: stop running containers, then rm any that remain.
 */
function cleanupOrphanedContainers(reason: string): void {
  try {
    const output = execSync('container ls --format json', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 15000,
    });
    const containers: { status: string; configuration: { id: string } }[] = JSON.parse(output || '[]');
    const nanoclaw = containers.filter(
      (c) => c.configuration.id.startsWith('nanoclaw-'),
    );

    // Stop running containers (skip any tracked by the current queue)
    const running = nanoclaw
      .filter((c) => c.status === 'running')
      .map((c) => c.configuration.id)
      .filter((name) => !queue.isActiveContainer(name));

    for (const name of running) {
      try {
        execSync(`container stop ${name}`, { stdio: 'pipe', timeout: 15000 });
      } catch { /* already stopped or XPC timeout — rm will handle it */ }
    }

    // Remove all stopped nanoclaw containers (including ones we just stopped)
    const stopped = nanoclaw
      .filter((c) => c.status === 'stopped')
      .map((c) => c.configuration.id);

    // Re-check after stopping — some may have transitioned to stopped
    let newlyStopped: string[] = [];
    if (running.length > 0) {
      try {
        const refreshed = execSync('container ls --format json', {
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
          timeout: 15000,
        });
        const refreshedContainers: { status: string; configuration: { id: string } }[] = JSON.parse(refreshed || '[]');
        newlyStopped = refreshedContainers
          .filter((c) => c.status === 'stopped' && c.configuration.id.startsWith('nanoclaw-'))
          .map((c) => c.configuration.id);
      } catch { /* use original stopped list */ }
    }

    const toRemove = [...new Set([...stopped, ...newlyStopped])];
    for (const name of toRemove) {
      try {
        execSync(`container rm ${name}`, { stdio: 'pipe', timeout: 10000 });
      } catch { /* already removed */ }
    }

    const total = running.length + toRemove.length;
    if (total > 0) {
      logger.info(
        { reason, stopped: running.length, removed: toRemove.length },
        'Cleaned up orphaned containers',
      );
    }
  } catch (err) {
    logger.warn({ err, reason }, 'Failed to clean up orphaned containers');
  }

  // Clean up stale IPC error files (older than 7 days)
  try {
    const errorDir = path.join(DATA_DIR, 'ipc', 'errors');
    if (fs.existsSync(errorDir)) {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const f of fs.readdirSync(errorDir)) {
        const fp = path.join(errorDir, f);
        const stat = fs.statSync(fp);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to clean up IPC error files');
  }

  // Prune buildkit cache if it exists (prevents unbounded growth)
  if (reason === 'periodic') {
    try {
      execSync('container builder prune --all --force', {
        stdio: 'pipe',
        timeout: 30000,
      });
      logger.debug('Pruned buildkit cache');
    } catch { /* builder may not be running — that's fine */ }
  }
}

async function connectTelegram(): Promise<void> {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramToken) {
    logger.info('Telegram bot token not configured, skipping Telegram integration');
    return;
  }

  const authorizedUserId = process.env.TELEGRAM_AUTHORIZED_USER_ID
    ? parseInt(process.env.TELEGRAM_AUTHORIZED_USER_ID, 10)
    : undefined;

  const mainChatId = process.env.TELEGRAM_MAIN_CHAT_ID
    ? parseInt(process.env.TELEGRAM_MAIN_CHAT_ID, 10)
    : undefined;

  // Track active Telegram containers to prevent concurrent spawns for the same chat.
  // Unlike the queue-based path (GroupQueue's state.active), Telegram messages bypass
  // the queue and can trigger parallel runAgent calls from the bot event handler.
  const activeTelegramGroups = new Set<string>();

  try {
    telegram = new TelegramIntegration(
      {
        token: telegramToken,
        authorizedUserId,
        mainChatId
      },
      // Message processor - reuse existing logic (streaming: response sent via onOutput callback)
      async (
        chatJid: string,
        content: string,
        timestamp: string,
        images?: Array<{ data: string; mediaType: 'image/jpeg' | 'image/png' }>,
        documents?: Array<{ data: string; filename: string }>
      ) => {
        const group = registeredGroups[chatJid];
        if (!group) {
          logger.warn({ chatJid }, 'Telegram chat not registered');
          return null;
        }

        // Build prompt from message (handle empty content for image-only messages)
        const messageContent = content || (images ? '[Image]' : '');
        const prompt = `<messages>\n<message sender="User" time="${timestamp}">${messageContent}</message>\n</messages>`;

        // If a container is already running for this chat, forward the new message into
        // it via IPC instead of spawning a parallel container. Mirrors the
        // queue.sendMessage() path. Uses a local Set (not state.active) because Telegram
        // bypasses GroupQueue's runForGroup and never sets state.active.
        if (activeTelegramGroups.has(chatJid)) {
          const inputDir = path.join(DATA_DIR, 'ipc', group.folder, 'input');
          try {
            fs.mkdirSync(inputDir, { recursive: true });
            const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
            const filepath = path.join(inputDir, filename);
            const tempPath = `${filepath}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify({ type: 'message', text: prompt }));
            fs.renameSync(tempPath, filepath);
            logger.debug({ chatJid, group: group.name }, 'Telegram follow-up forwarded to active container');
          } catch (err) {
            logger.error({ err, chatJid }, 'Failed to forward Telegram follow-up to active container');
          }
          return null;
        }

        activeTelegramGroups.add(chatJid);
        // Idle timer declared outside try so finally can clear it on error paths too.
        let idleTimer: ReturnType<typeof setTimeout> | null = null;
        try {
          // Idle timer: signal container to exit after IDLE_TIMEOUT ms with no output.
          // Mirrors the queue processing path. Without this, the container's
          // waitForIpcMessage() loop runs indefinitely after the agent finishes.
          const resetIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              logger.debug({ group: group.name }, 'Telegram idle timeout, closing container stdin');
              queue.closeStdin(chatJid);
            }, IDLE_TIMEOUT);
          };
          resetIdleTimer(); // start timer immediately (covers cases with no output at all)

          // Streaming state for this request
          const numericChatId = parseInt(chatJid.replace('telegram:', ''), 10);
          let accumulatedText = '';
          let draftFailed = false;   // true = sendMessageDraft not supported, use editMessageText
          let streamingMsgId: number | null = null;
          let lastStreamTime = 0;
          const STREAM_THROTTLE_MS = 300; // max one draft/edit per 300 ms

          await runAgent(group, prompt, chatJid, async (output) => {
            if (output.result) {
              resetIdleTimer(); // keep container alive while results are flowing
              const raw = typeof output.result === 'string' ? output.result : JSON.stringify(output.result);
              const chunk = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
              if (!chunk) return;

              accumulatedText += (accumulatedText ? '\n\n' : '') + chunk;

              const now = Date.now();
              if (now - lastStreamTime < STREAM_THROTTLE_MS) return; // throttle
              lastStreamTime = now;

              if (!draftFailed) {
                // Primary path: sendMessageDraft (Bot API 9.3+)
                try {
                  await telegram!.getHandler().sendMessageDraft(numericChatId, accumulatedText);
                } catch (err: any) {
                  draftFailed = true;
                  logger.debug({ chatJid, description: err?.telegramDescription }, 'sendMessageDraft unsupported, falling back to editMessageText');
                }
              }

              if (draftFailed) {
                // Fallback path: sendMessage once, then editMessageText
                if (streamingMsgId === null) {
                  const msg = await telegram!.getHandler().sendMessageWithId(numericChatId, accumulatedText + ' ▌');
                  streamingMsgId = msg.message_id;
                } else {
                  await telegram!.getHandler().editMessageText(numericChatId, streamingMsgId, accumulatedText + ' ▌');
                }
              }
            }
          }, images, documents);

          // Finalize: flush any remaining accumulated text
          if (accumulatedText) {
            if (!draftFailed) {
              // Draft was streaming — send the real final message
              await sendMessage(chatJid, accumulatedText);
            } else if (streamingMsgId !== null) {
              // Remove the streaming cursor from the last edit
              await telegram!.getHandler().editMessageText(numericChatId, streamingMsgId, accumulatedText);
            } else {
              // Throttle swallowed all updates — send normally
              await sendMessage(chatJid, accumulatedText);
            }
          }

          // Response already sent above, return null
          return null;
        } finally {
          if (idleTimer) clearTimeout(idleTimer);
          activeTelegramGroups.delete(chatJid);
        }
      },
      // Response sender
      sendMessage,
      // Session clearer
      clearSessionForGroup
    );

    const botInfo = await telegram.getMe();
    logger.info({ username: botInfo.username, id: botInfo.id }, 'Connected to Telegram');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Telegram');
    telegram = null;
  }
}

async function main(): Promise<void> {
  ensureContainerSystemRunning();
  initDatabase();
  logger.info('Database initialized');
  loadState();

  // Periodic container cleanup — catch orphans that accumulate during runtime
  // (e.g. containers that outlive their parent task due to XPC timeouts)
  const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
  const cleanupTimer = setInterval(() => {
    cleanupOrphanedContainers('periodic');
  }, CLEANUP_INTERVAL);
  cleanupTimer.unref(); // Don't prevent process exit

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(cleanupTimer);
    if (telegram) {
      await telegram.shutdown();
    }
    await queue.shutdown(10000);
    // Clean up any containers that were detached during shutdown
    cleanupOrphanedContainers('shutdown');
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start IPC watcher
  startIpcWatcher();

  // Start scheduler loop (previously gated behind WA connection)
  startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) => queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage,
    assistantName: ASSISTANT_NAME,
  });

  // Connect to Telegram (sole messaging channel)
  await connectTelegram();

  logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start NanoClaw');
  process.exit(1);
});
