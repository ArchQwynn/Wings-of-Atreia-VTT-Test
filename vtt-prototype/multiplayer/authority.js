(function (root) {
  'use strict';

  // Pure guard helpers for the future host integration. These helpers do not
  // provide networking, authentication, or a distributed host-election service.
  function createAuthority(options) {
    const settings = options && typeof options === 'object' ? options : {};
    let hostGeneration = nonNegativeInteger(settings.hostGeneration, 1);
    let revision = nonNegativeInteger(settings.revision, 0);
    let hostActive = settings.hostActive !== false;

    function getVersion() {
      return Object.freeze({ hostGeneration: hostGeneration, revision: revision, hostActive: hostActive });
    }

    function activateGeneration(nextGeneration, externallyAuthorized) {
      if (externallyAuthorized !== true) {
        return { ok: false, code: 'RECOVERY_NOT_AUTHORIZED', error: 'A trusted recovery coordinator must authorize host-generation changes.' };
      }
      if (!Number.isSafeInteger(nextGeneration) || nextGeneration <= hostGeneration) {
        return { ok: false, code: 'INVALID_HOST_GENERATION', error: 'The next host generation must be a higher safe integer.' };
      }
      hostGeneration = nextGeneration;
      hostActive = true;
      return { ok: true, version: getVersion() };
    }

    function setHostActive(active) {
      if (typeof active !== 'boolean') return { ok: false, code: 'INVALID_HOST_STATUS' };
      hostActive = active;
      return { ok: true, version: getVersion() };
    }

    function checkMessage(message, options) {
      const foundation = root.WoAMultiplayerFoundation;
      if (!foundation || typeof foundation.validateMessage !== 'function') {
        return { ok: false, code: 'FOUNDATION_UNAVAILABLE', error: 'Load protocol.js before authority.js.' };
      }
      const validation = foundation.validateMessage(message);
      if (!validation.ok) return { ok: false, code: 'INVALID_MESSAGE', error: validation.error };
      if (message.hostGeneration !== hostGeneration) {
        return { ok: false, code: 'HOST_GENERATION_MISMATCH', error: 'Message belongs to a different host generation.' };
      }
      if (message.revision < revision) {
        return { ok: false, code: 'STALE_REVISION', error: 'Message revision is older than the authoritative revision.' };
      }
      if (options && options.requireNextRevision === true && message.revision !== revision + 1) {
        return { ok: false, code: 'REVISION_GAP', error: 'A state update must use the next authoritative revision.' };
      }
      return { ok: true, version: getVersion() };
    }

    function authorizeAction(request, context) {
      const ctx = context && typeof context === 'object' ? context : {};
      if (!hostActive) return { ok: false, code: 'HOST_INACTIVE', error: 'The authoritative host is not active.' };
      if (!request || typeof request !== 'object') return { ok: false, code: 'INVALID_REQUEST', error: 'Action request must be an object.' };
      if (!nonEmptyString(request.actorId) || !nonEmptyString(request.objectId) || !nonEmptyString(request.action)) {
        return { ok: false, code: 'INVALID_REQUEST', error: 'Actor, target object, and action are required.' };
      }
      if (request.hostGeneration !== hostGeneration) {
        return { ok: false, code: 'HOST_GENERATION_MISMATCH', error: 'Request belongs to a different host generation.' };
      }
      if (request.baseRevision !== revision) {
        return { ok: false, code: 'STALE_REQUEST', error: 'The scene changed after this request was created; refresh and review it.' };
      }
      if (ctx.targetExists !== true) {
        return { ok: false, code: 'TARGET_UNAVAILABLE', error: 'The requested target is unavailable in the current scene.' };
      }
      const permissions = ctx.permissions;
      const actorPermissions = permissions && permissions[request.actorId];
      const objectPermissions = actorPermissions && actorPermissions[request.objectId];
      if (!objectPermissions || objectPermissions[request.action] !== true) {
        return { ok: false, code: 'ACTION_NOT_AUTHORIZED', error: 'This actor is not authorized for that action on this object.' };
      }
      return { ok: true, version: getVersion() };
    }

    function advanceRevision(expectedGeneration, expectedRevision) {
      if (!hostActive) return { ok: false, code: 'HOST_INACTIVE' };
      if (expectedGeneration !== hostGeneration) return { ok: false, code: 'HOST_GENERATION_MISMATCH' };
      if (expectedRevision !== revision) return { ok: false, code: 'REVISION_CONFLICT' };
      if (revision >= Number.MAX_SAFE_INTEGER) return { ok: false, code: 'REVISION_EXHAUSTED' };
      revision += 1;
      return { ok: true, version: getVersion() };
    }

    return Object.freeze({
      getVersion: getVersion,
      activateGeneration: activateGeneration,
      setHostActive: setHostActive,
      checkMessage: checkMessage,
      authorizeAction: authorizeAction,
      advanceRevision: advanceRevision
    });
  }

  function createJoinApprovalQueue() {
    const attempts = new Map();

    function requestJoin(input) {
      if (!input || typeof input !== 'object' ||
          typeof input.attemptId !== 'string' || input.attemptId.length < 8 || input.attemptId.length > 100 ||
          typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.trim().length > 40) {
        return { ok: false, code: 'INVALID_JOIN_REQUEST', error: 'A unique attempt ID and display name of 1–40 characters are required.' };
      }
      if (attempts.has(input.attemptId)) {
        return { ok: false, code: 'DUPLICATE_ATTEMPT', error: 'This join attempt has already been submitted.' };
      }
      const request = {
        attemptId: input.attemptId,
        displayName: input.displayName.trim(),
        status: 'pending',
        requestedAt: Number.isFinite(input.requestedAt) ? input.requestedAt : Date.now()
      };
      attempts.set(request.attemptId, request);
      return { ok: true, request: copyRequest(request) };
    }

    function decide(attemptId, decision) {
      const request = attempts.get(attemptId);
      if (!request) return { ok: false, code: 'JOIN_ATTEMPT_NOT_FOUND' };
      if (request.status !== 'pending') return { ok: false, code: 'JOIN_ATTEMPT_ALREADY_DECIDED' };
      if (decision !== 'approved' && decision !== 'rejected') {
        return { ok: false, code: 'INVALID_JOIN_DECISION' };
      }
      request.status = decision;
      request.decidedAt = Date.now();
      return { ok: true, request: copyRequest(request) };
    }

    function get(attemptId) {
      const request = attempts.get(attemptId);
      return request ? copyRequest(request) : null;
    }

    function list() {
      return Array.from(attempts.values(), copyRequest);
    }

    return Object.freeze({ requestJoin: requestJoin, decide: decide, get: get, list: list });
  }

  function filterVisibleObjects(objects, canSeeObject) {
    if (!Array.isArray(objects)) throw new TypeError('Objects must be an array.');
    if (typeof canSeeObject !== 'function') throw new TypeError('A visibility predicate is required.');
    return objects.filter(function (object) {
      try { return canSeeObject(object) === true; } catch (_) { return false; }
    });
  }

  function nonNegativeInteger(value, fallback) {
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function copyRequest(request) {
    return Object.assign({}, request);
  }

  root.WoAMultiplayerFoundation = root.WoAMultiplayerFoundation || {};
  Object.assign(root.WoAMultiplayerFoundation, {
    createAuthority: createAuthority,
    createJoinApprovalQueue: createJoinApprovalQueue,
    filterVisibleObjects: filterVisibleObjects
  });
})(typeof window !== 'undefined' ? window : globalThis);
