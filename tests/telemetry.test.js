import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSendTelemetry } from '../src/telemetry.js';

describe('shouldSendTelemetry', () => {
  it('returns false when noTelemetry flag is set', () => {
    assert.equal(shouldSendTelemetry({ noTelemetry: true }), false);
  });

  it('respects CC_HUBBER_TELEMETRY=0', () => {
    const orig = process.env.CC_HUBBER_TELEMETRY;
    process.env.CC_HUBBER_TELEMETRY = '0';
    try {
      assert.equal(shouldSendTelemetry({ noTelemetry: false }), false);
    } finally {
      if (orig === undefined) delete process.env.CC_HUBBER_TELEMETRY;
      else process.env.CC_HUBBER_TELEMETRY = orig;
    }
  });

  it('respects DO_NOT_TRACK=1', () => {
    const orig = process.env.DO_NOT_TRACK;
    process.env.DO_NOT_TRACK = '1';
    try {
      assert.equal(shouldSendTelemetry({ noTelemetry: false }), false);
    } finally {
      if (orig === undefined) delete process.env.DO_NOT_TRACK;
      else process.env.DO_NOT_TRACK = orig;
    }
  });
});
