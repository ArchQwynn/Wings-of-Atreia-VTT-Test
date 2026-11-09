const test = require('node:test');
const assert = require('node:assert/strict');

require('../protocol.js');
require('../lifecycle.js');

const foundation = globalThis.WoAMultiplayerFoundation;

function validMessage(overrides = {}) {
  return {
    protocolVersion: 1,
    type: 'PING',
    messageId: 'test-message-123',
    sentAt: Date.now(),
    hostGeneration: 0,
    revision: 0,
    payload: {},
    ...overrides
  };
}

test('creates and validates a well-formed message', () => {
  const message = foundation.createMessage(
    'STATE_UPDATE',
    { scene: { mapId: 'map-1' } },
    { hostGeneration: 2, revision: 7 }
  );

  assert.equal(foundation.validateMessage(message).ok, true);
  assert.equal(message.hostGeneration, 2);
  assert.equal(message.revision, 7);
});

test('rejects non-object message envelopes', () => {
  for (const value of [null, [], 'message', 2]) {
    assert.equal(foundation.validateMessage(value).ok, false);
  }
});

test('rejects unsupported protocol versions and message types', () => {
  assert.equal(foundation.validateMessage(validMessage({ protocolVersion: 99 })).ok, false);
  assert.equal(foundation.validateMessage(validMessage({ type: 'UNKNOWN' })).ok, false);
});

test('rejects malformed IDs, timestamps, generations, revisions, and payloads', () => {
  const malformed = [
    { messageId: 'x' },
    { sentAt: NaN },
    { hostGeneration: -1 },
    { hostGeneration: 1.2 },
    { revision: -1 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { payload: null },
    { payload: [] }
  ];

  for (const overrides of malformed) {
    assert.equal(foundation.validateMessage(validMessage(overrides)).ok, false);
  }
});

test('rejects messages larger than the 64 KiB limit', () => {
  const message = validMessage({ payload: { data: 'x'.repeat(66 * 1024) } });
  assert.equal(foundation.validateMessage(message).ok, false);
  assert.throws(
    () => foundation.createMessage('PING', { data: 'x'.repeat(66 * 1024) }),
    /size limit/
  );
});

test('rejects unsupported types on creation and safely defaults invalid metadata', () => {
  assert.throws(() => foundation.createMessage('NOPE', {}), /Unsupported/);

  const message = foundation.createMessage('PING', {}, {
    revision: -1,
    hostGeneration: 1.1
  });

  assert.equal(message.revision, 0);
  assert.equal(message.hostGeneration, 0);
});

test('supports the host lifecycle and a recovery path', () => {
  const lifecycle = foundation.createLifecycle();

  for (const state of [
    'creating', 'hosting', 'active', 'recovering', 'active', 'closing', 'closed'
  ]) {
    assert.equal(lifecycle.transition(state).ok, true, `transition to ${state}`);
  }

  assert.equal(lifecycle.getState(), 'closed');
});

test('supports player joining, reconnecting, and rejoining after closure', () => {
  const lifecycle = foundation.createLifecycle();

  for (const state of [
    'joining', 'connecting', 'active', 'recovering', 'active',
    'closing', 'closed', 'joining', 'connecting', 'active'
  ]) {
    assert.equal(lifecycle.transition(state).ok, true, `transition to ${state}`);
  }
});

test('rejects invalid lifecycle transitions and unknown states', () => {
  const lifecycle = foundation.createLifecycle();

  assert.equal(lifecycle.transition('active').ok, false);
  assert.equal(lifecycle.transition('not-a-state').ok, false);
  assert.throws(() => foundation.createLifecycle('bogus'), /Unknown initial/);
});

test('notifies listeners and supports unsubscribe', () => {
  const lifecycle = foundation.createLifecycle();
  const events = [];
  const unsubscribe = lifecycle.subscribe(event => events.push(event));

  lifecycle.transition('creating');
  assert.equal(events.length, 1);
  assert.equal(events[0].previous, 'idle');
  assert.equal(events[0].current, 'creating');

  unsubscribe();
  lifecycle.transition('joining');
  assert.equal(events.length, 1);
  assert.throws(() => lifecycle.subscribe('not a function'), /must be a function/);
});

test('uses dedicated camera message types, separate from shared tabletop updates', () => {
  assert.ok(foundation.messageTypes.includes('STATE_UPDATE'));
  assert.ok(foundation.messageTypes.includes('CAMERA_SYNC_SETTING'));
  assert.ok(foundation.messageTypes.includes('CAMERA_VIEW_UPDATE'));

  assert.notEqual('CAMERA_SYNC_SETTING', 'STATE_UPDATE');
  assert.notEqual('CAMERA_VIEW_UPDATE', 'STATE_UPDATE');

  const cameraSetting = foundation.createMessage('CAMERA_SYNC_SETTING', { enabled: true });
  const cameraView = foundation.createMessage('CAMERA_VIEW_UPDATE', {
    position: { x: 1, y: 2, z: 3 },
    rotation: { x: 0, y: 0, z: 0 },
    zoom: 1.25
  });
  const tabletopUpdate = foundation.createMessage('STATE_UPDATE', {
    scene: { mapId: 'map-1' },
    tokens: [{ id: 'token-1', x: 10, y: 12 }]
  });

  assert.equal(foundation.validateMessage(cameraSetting).ok, true);
  assert.equal(foundation.validateMessage(cameraView).ok, true);
  assert.equal(foundation.validateMessage(tabletopUpdate).ok, true);
  assert.equal(cameraView.type, 'CAMERA_VIEW_UPDATE');
  assert.equal(tabletopUpdate.type, 'STATE_UPDATE');
});
