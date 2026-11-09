(function (root) {
  'use strict';

  const STATES = Object.freeze({
    IDLE: 'idle',
    CREATING: 'creating',
    HOSTING: 'hosting',
    JOINING: 'joining',
    CONNECTING: 'connecting',
    ACTIVE: 'active',
    PAUSED: 'paused',
    RECOVERING: 'recovering',
    CLOSING: 'closing',
    CLOSED: 'closed',
    ERROR: 'error'
  });

  const TRANSITIONS = Object.freeze({
    idle: ['creating', 'joining'],
    creating: ['hosting', 'error', 'closing'],
    hosting: ['active', 'paused', 'recovering', 'closing', 'error'],
    joining: ['connecting', 'error', 'closing'],
    connecting: ['active', 'error', 'closing'],
    active: ['paused', 'recovering', 'closing', 'error'],
    paused: ['recovering', 'active', 'closing', 'error'],
    recovering: ['active', 'paused', 'closing', 'error'],
    closing: ['closed', 'error'],
    closed: ['creating', 'joining'],
    error: ['closing', 'closed', 'creating', 'joining']
  });

  function createLifecycle(initialState) {
    let current = initialState || STATES.IDLE;
    if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, current)) {
      throw new Error('Unknown initial multiplayer lifecycle state.');
    }

    const listeners = new Set();

    function transition(next, details) {
      if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, next)) {
        return { ok: false, error: 'Unknown target state.' };
      }
      if (next === current) {
        return { ok: true, state: current, unchanged: true };
      }
      if (!TRANSITIONS[current].includes(next)) {
        return {
          ok: false,
          error: 'Invalid multiplayer state transition: ' + current + ' -> ' + next
        };
      }

      const previous = current;
      current = next;
      const event = {
        previous: previous,
        current: current,
        at: Date.now(),
        details: details && typeof details === 'object' ? details : {}
      };

      listeners.forEach(function (listener) {
        try { listener(event); } catch (error) {
          // One observer must not break the lifecycle for other observers.
          setTimeout(function () { throw error; }, 0);
        }
      });

      return { ok: true, state: current, event: event };
    }

    return Object.freeze({
      getState: function () { return current; },
      canTransition: function (next) {
        return Object.prototype.hasOwnProperty.call(TRANSITIONS, next) &&
          (next === current || TRANSITIONS[current].includes(next));
      },
      transition: transition,
      subscribe: function (listener) {
        if (typeof listener !== 'function') {
          throw new TypeError('Lifecycle listener must be a function.');
        }
        listeners.add(listener);
        return function unsubscribe() { listeners.delete(listener); };
      }
    });
  }

  root.WoAMultiplayerFoundation = root.WoAMultiplayerFoundation || {};
  Object.assign(root.WoAMultiplayerFoundation, {
    states: STATES,
    createLifecycle: createLifecycle
  });
})(typeof window !== 'undefined' ? window : globalThis);
