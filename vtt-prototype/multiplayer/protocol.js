(function (root) {
  'use strict';

  const PROTOCOL_VERSION = 1;
  const MAX_MESSAGE_BYTES = 64 * 1024;
  const MESSAGE_TYPES = new Set([
    'JOIN_REQUEST',
    'JOIN_ACCEPTED',
    'JOIN_REJECTED',
    'PING',
    'PONG',
    'STATE_SNAPSHOT_REQUEST',
    'STATE_SNAPSHOT',
    'STATE_UPDATE',
    'CAMERA_SYNC_SETTING',
    'CAMERA_VIEW_UPDATE',
    'ACTION_REQUEST',
    'ACTION_RESULT',
    'HOST_PAUSED',
    'HOST_RESUMED',
    'RESYNC_REQUEST',
    'SESSION_CLOSED',
    'ERROR'
  ]);

  function byteLength(value) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(value).length;
    }
    return unescape(encodeURIComponent(value)).length;
  }

  function createMessage(type, payload, metadata) {
    if (!MESSAGE_TYPES.has(type)) {
      throw new Error('Unsupported multiplayer message type.');
    }

    const meta = metadata && typeof metadata === 'object' ? metadata : {};
    const message = {
      protocolVersion: PROTOCOL_VERSION,
      type: type,
      messageId: createId(),
      sentAt: Date.now(),
      hostGeneration: safeNonNegativeInteger(meta.hostGeneration, 0),
      revision: safeNonNegativeInteger(meta.revision, 0),
      payload: payload == null ? {} : payload
    };

    const serialized = JSON.stringify(message);
    if (byteLength(serialized) > MAX_MESSAGE_BYTES) {
      throw new Error('Multiplayer message exceeds the size limit.');
    }
    return message;
  }

  function validateMessage(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, error: 'Message must be an object.' };
    }

    if (input.protocolVersion !== PROTOCOL_VERSION) {
      return { ok: false, error: 'Unsupported protocol version.' };
    }
    if (!MESSAGE_TYPES.has(input.type)) {
      return { ok: false, error: 'Unsupported message type.' };
    }
    if (typeof input.messageId !== 'string' || input.messageId.length < 8 || input.messageId.length > 100) {
      return { ok: false, error: 'Invalid message ID.' };
    }
    if (!Number.isFinite(input.sentAt) || input.sentAt < 0) {
      return { ok: false, error: 'Invalid message timestamp.' };
    }
    if (!Number.isSafeInteger(input.hostGeneration) || input.hostGeneration < 0) {
      return { ok: false, error: 'Invalid host generation.' };
    }
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
      return { ok: false, error: 'Invalid state revision.' };
    }
    if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
      return { ok: false, error: 'Payload must be an object.' };
    }

    let size;
    try {
      size = byteLength(JSON.stringify(input));
    } catch (_) {
      return { ok: false, error: 'Message cannot be serialized.' };
    }
    if (size > MAX_MESSAGE_BYTES) {
      return { ok: false, error: 'Message exceeds the size limit.' };
    }

    return { ok: true, message: input };
  }

  function createId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') {
      return root.crypto.randomUUID();
    }
    const random = Math.random().toString(36).slice(2);
    return 'woa-' + Date.now().toString(36) + '-' + random;
  }

  function safeNonNegativeInteger(value, fallback) {
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  }

  root.WoAMultiplayerFoundation = root.WoAMultiplayerFoundation || {};
  Object.assign(root.WoAMultiplayerFoundation, {
    protocolVersion: PROTOCOL_VERSION,
    maxMessageBytes: MAX_MESSAGE_BYTES,
    messageTypes: Array.from(MESSAGE_TYPES),
    createMessage: createMessage,
    validateMessage: validateMessage
  });
})(typeof window !== 'undefined' ? window : globalThis);
