import { sleep } from 'k6';
import exec from 'k6/execution';
import { browser } from 'k6/browser';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  formatDurationMs,
  isEnabled,
  readDurationMs,
  readPositiveInt,
  waitForLocatorCountAtLeast,
  waitForLocatorText,
} from './helper.js';

// Browser-level media behavior is controlled by K6_BROWSER_* env vars at launch time.
// Example:
// K6_BROWSER_ARGS='use-fake-device-for-media-stream,use-fake-ui-for-media-stream,use-file-for-fake-video-capture=/home/hari/workspace/mediasoup-poc/load_testing/fake_media/Johnny_1280x720_60.y4m,use-file-for-fake-audio-capture=/home/hari/workspace/mediasoup-poc/load_testing/fake_media/long-audio-5min-44100hz-16bit.wav'

const appConfig = readAppConfig(__ENV);
const runtimeConfig = readRuntimeConfig(__ENV, appConfig);

const joinDuration = new Trend('session_join_duration', true);
const holdActionDuration = new Trend('staff_hold_action_duration', true);
const joinSuccess = new Rate('session_join_success');
const holdActionSuccess = new Rate('staff_hold_action_success');
const joinFailures = new Counter('session_join_failures');

export const options = {
  scenarios: {
    ui: {
      executor: runtimeConfig.executor,
      vus: runtimeConfig.vus,
      iterations: runtimeConfig.iterations,
      maxDuration: runtimeConfig.maxDuration,
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: runtimeConfig.thresholds,
};

export default async function mediasoupSessionTest() {
  const assignment = createAssignment(exec.vu.idInTest);
  await waitForAssignedStart(assignment);

  const context = await createBrowserContext(assignment);
  const page = await context.newPage();
  const tags = buildMetricTags(assignment);
  const joinStartedAt = Date.now();

  try {
    await joinAssignedRole(page, assignment);
    recordJoinSuccess(tags, joinStartedAt);
    await holdAssignedSession(page, assignment);
  } catch (error) {
    recordJoinFailure(tags);
    throw error;
  } finally {
    await closeBrowserSession(page, context);
  }
}

async function waitForAssignedStart(assignment) {
  const startDelayMs = getStartDelayMs(assignment);
  if (startDelayMs > 0) {
    sleep(startDelayMs / 1000);
  }
}

async function createBrowserContext(assignment) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  if (assignment.role === 'student') {
    await context.grantPermissions(['camera', 'microphone'], { origin: appConfig.baseUrl });
  }

  return context;
}

function buildMetricTags(assignment) {
  return {
    role: assignment.role,
    room: assignment.roomId,
  };
}

async function joinAssignedRole(page, assignment) {
  if (assignment.role === 'student') {
    await joinAsStudent(page, assignment);
    return;
  }

  await joinAsStaff(page, assignment);
}

function recordJoinSuccess(tags, joinStartedAt) {
  joinDuration.add(Date.now() - joinStartedAt, tags);
  joinSuccess.add(true, tags);
}

function recordJoinFailure(tags) {
  joinSuccess.add(false, tags);
  joinFailures.add(1, tags);
}

async function holdAssignedSession(page, assignment) {
  const holdUntil = Date.now() + appConfig.sessionDurationMs;

  while (Date.now() < holdUntil) {
    if (assignment.role === 'staff') {
      await performStaffHoldCycle(page, assignment);
    }

    sleep(appConfig.holdLoopIntervalMs / 1000);
  }
}

async function performStaffHoldCycle(page, assignment) {
  const actionStartedAt = Date.now();
  const success = await performStaffHoldAction(page);
  holdActionSuccess.add(success, { room: assignment.roomId });
  holdActionDuration.add(Date.now() - actionStartedAt, { room: assignment.roomId });
}

async function closeBrowserSession(page, context) {
  try {
    await page.close();
  } finally {
    await context.close();
  }
}

async function joinAsStudent(page, assignment) {
  await page.goto(`${appConfig.baseUrl}/student`, { waitUntil: 'networkidle' });
  await page.locator('#student-name').fill(assignment.name);
  await page.locator('#student-room').fill(assignment.roomId);
  await page.locator('#student-join').click();

  await page.locator('#student-room-info').waitFor({
    state: 'visible',
    timeout: appConfig.studentJoinTimeoutMs,
  });
  await page.locator('#student-self-preview').waitFor({
    state: 'visible',
    timeout: appConfig.studentJoinTimeoutMs,
  });
  await waitForLocatorText(
    page.locator('#student-room-info'),
    [assignment.roomId, assignment.name],
    appConfig.studentJoinTimeoutMs
  );
}

async function joinAsStaff(page, assignment) {
  await page.goto(`${appConfig.baseUrl}/staff`, { waitUntil: 'networkidle' });
  await page.locator('#staff-name').fill(assignment.name);

  const roomJoinButton = await waitForJoinableRoom(page, assignment.roomId);
  await roomJoinButton.click();

  await page.locator('#staff-room-info').waitFor({
    state: 'visible',
    timeout: appConfig.staffJoinTimeoutMs,
  });
  await waitForLocatorText(
    page.locator('#staff-room-info'),
    [assignment.roomId, assignment.name],
    appConfig.staffJoinTimeoutMs
  );
  await waitForVisibleTiles(page, appConfig.staffJoinTimeoutMs);
}

async function waitForJoinableRoom(page, roomId) {
  const deadline = Date.now() + appConfig.staffRoomDiscoveryTimeoutMs;
  const roomJoinButton = page.locator(`#staff-join-room-${roomId}`);

  while (Date.now() < deadline) {
    await page.locator('#staff-refresh-rooms').click();

    if (await roomJoinButton.isVisible().catch(() => false)) {
      return roomJoinButton;
    }

    sleep(appConfig.roomPollIntervalMs / 1000);
  }

  throw new Error(`room ${roomId} never became joinable for staff`);
}

async function waitForVisibleTiles(page, timeoutMs) {
  await waitForLocatorCountAtLeast(page.locator('[id^="staff-student-tile-"]'), 1, timeoutMs);
}

async function performStaffHoldAction(page) {
  try {
    await changeVisiblePage(page);
    await openAndCloseFocusModal(page);
    return true;
  } catch (_error) {
    return false;
  }
}

async function changeVisiblePage(page) {
  const nextButton = page.locator('#staff-page-next');
  if (await isEnabled(nextButton)) {
    await nextButton.click();
    await page.waitForTimeout(500);
    return;
  }

  const prevButton = page.locator('#staff-page-prev');
  if (await isEnabled(prevButton)) {
    await prevButton.click();
    await page.waitForTimeout(500);
  }
}

async function openAndCloseFocusModal(page) {
  const focusButtons = page.locator('[id^="staff-focus-open-"]');
  const focusCount = await focusButtons.count();
  if (!focusCount) {
    throw new Error('no focus buttons available');
  }

  await focusButtons.first().click();
  await page.locator('#staff-focus-modal').waitFor({
    state: 'visible',
    timeout: appConfig.focusActionTimeoutMs,
  });
  await page.locator('#staff-focus-close').click();
  await page.locator('#staff-focus-modal').waitFor({
    state: 'hidden',
    timeout: appConfig.focusActionTimeoutMs,
  });
}

function createAssignment(vuId) {
  const zeroBasedVu = vuId - 1;
  const participantsPerRoom = appConfig.studentsPerRoom + appConfig.staffPerRoom;
  const roomIndex = Math.floor(zeroBasedVu / participantsPerRoom);
  const positionInRoom = zeroBasedVu % participantsPerRoom;
  const roomId = `${appConfig.roomPrefix}-${roomIndex + 1}`;

  if (positionInRoom < appConfig.studentsPerRoom) {
    return createStudentAssignment(roomIndex, positionInRoom, roomId);
  }

  return createStaffAssignment(roomIndex, positionInRoom, roomId);
}

function createStudentAssignment(roomIndex, positionInRoom, roomId) {
  const studentIndex = roomIndex * appConfig.studentsPerRoom + positionInRoom + 1;

  return {
    role: 'student',
    roomIndex,
    participantIndex: positionInRoom + 1,
    globalRoleIndex: studentIndex,
    roomId,
    name: `${appConfig.studentNamePrefix}-${studentIndex}`,
  };
}

function createStaffAssignment(roomIndex, positionInRoom, roomId) {
  const staffIndexInRoom = positionInRoom - appConfig.studentsPerRoom;
  const staffIndex = roomIndex * appConfig.staffPerRoom + staffIndexInRoom + 1;

  return {
    role: 'staff',
    roomIndex,
    participantIndex: staffIndexInRoom + 1,
    globalRoleIndex: staffIndex,
    roomId,
    name: `${appConfig.staffNamePrefix}-${staffIndex}`,
  };
}

function getStartDelayMs(assignment) {
  if (assignment.role === 'student') {
    return getStudentStartDelayMs(assignment.globalRoleIndex);
  }

  return appConfig.rampUpMs + appConfig.staffStartBufferMs + assignment.roomIndex * appConfig.perRoomStaffOffsetMs;
}

function getStudentStartDelayMs(globalRoleIndex) {
  if (appConfig.totalStudents <= 1 || appConfig.rampUpMs <= 0) {
    return 0;
  }

  const spreadIndex = globalRoleIndex - 1;
  return Math.floor((appConfig.rampUpMs * spreadIndex) / Math.max(1, appConfig.totalStudents - 1));
}

function readAppConfig(env) {
  const roomCount = readPositiveInt(env, 'ROOM_COUNT', 1);
  const studentsPerRoom = readPositiveInt(env, 'STUDENTS_PER_ROOM', 10);
  const staffPerRoom = readPositiveInt(env, 'STAFF_PER_ROOM', 1);
  const totalStudents = roomCount * studentsPerRoom;
  const totalParticipants = roomCount * (studentsPerRoom + staffPerRoom);

  return {
    baseUrl: readBaseUrl(env),
    roomPrefix: env.ROOM_PREFIX || 'room',
    roomCount,
    studentsPerRoom,
    staffPerRoom,
    totalStudents,
    totalParticipants,
    sessionDurationMs: readDurationMs(env, 'SESSION_DURATION', '5m'),
    rampUpMs: readDurationMs(env, 'RAMP_UP', '30s'),
    holdLoopIntervalMs: readDurationMs(env, 'HOLD_LOOP_INTERVAL', '20s'),
    staffStartBufferMs: readDurationMs(env, 'STAFF_START_BUFFER', '5s'),
    perRoomStaffOffsetMs: readDurationMs(env, 'PER_ROOM_STAFF_OFFSET', '2s'),
    roomPollIntervalMs: readDurationMs(env, 'ROOM_POLL_INTERVAL', '2s'),
    studentJoinTimeoutMs: readDurationMs(env, 'STUDENT_JOIN_TIMEOUT', '30s'),
    staffJoinTimeoutMs: readDurationMs(env, 'STAFF_JOIN_TIMEOUT', '45s'),
    staffRoomDiscoveryTimeoutMs: readDurationMs(env, 'STAFF_ROOM_DISCOVERY_TIMEOUT', '60s'),
    focusActionTimeoutMs: readDurationMs(env, 'FOCUS_ACTION_TIMEOUT', '10s'),
    studentNamePrefix: env.STUDENT_NAME_PREFIX || 'student',
    staffNamePrefix: env.STAFF_NAME_PREFIX || 'staff',
  };
}

function readRuntimeConfig(env, currentAppConfig) {
  const maxDurationMs =
    currentAppConfig.rampUpMs +
    currentAppConfig.staffStartBufferMs +
    (currentAppConfig.roomCount > 0 ? (currentAppConfig.roomCount - 1) * currentAppConfig.perRoomStaffOffsetMs : 0) +
    currentAppConfig.sessionDurationMs +
    readDurationMs(env, 'TEST_PADDING', '45s');

  return {
    executor: 'per-vu-iterations',
    vus: currentAppConfig.totalParticipants,
    iterations: 1,
    maxDuration: formatDurationMs(maxDurationMs),
    thresholds: buildThresholds(),
  };
}

function buildThresholds() {
  return {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.03'],
    http_req_duration: ['p(95)<1500'],
    session_join_success: ['rate>0.97'],
    'session_join_duration{role:student}': ['p(95)<15000'],
    'session_join_duration{role:staff}': ['p(95)<20000'],
    staff_hold_action_success: ['rate>0.9'],
    staff_hold_action_duration: ['p(95)<5000'],
    browser_web_vital_cls: ['p(95)<0.25'],
    browser_web_vital_inp: ['p(95)<500'],
    browser_web_vital_lcp: ['p(95)<4000'],
  };
}

function readBaseUrl(env) {
  const baseUrl = (env.BASE_URL || '').trim();
  if (!baseUrl) {
    throw new Error('BASE_URL is required');
  }

  return baseUrl.replace(/\/$/, '');
}
