/**
 * Smooths the final, already-prioritized Live2D parameter map.
 *
 * The design is adapted from the layered mixing/smoothing approach used by
 * soullink-emotion-sdk (MIT): references/soullink-emotion-sdk/LICENSE.
 * It stays renderer-agnostic so the app can keep using the official Cubism SDK.
 */

const DEFAULT_SPEED = 12;
const RELEASE_EPSILON = 0.002;

function neutralValue(paramId: string): number {
  if (["ParamEyeLOpen", "ParamEyeROpen", "PARAM_EYE_L_OPEN", "PARAM_EYE_R_OPEN"].includes(paramId)) return 1;
  return 0;
}

function speedForParameter(paramId: string): number {
  if (paramId === "ParamMouthOpenY" || paramId === "PARAM_MOUTH_OPEN_Y") return 24;
  if (paramId.startsWith("ParamAngle") || paramId.startsWith("ParamBodyAngle") || paramId.startsWith("PARAM_ANGLE") || paramId.startsWith("PARAM_BODY_ANGLE")) return 7;
  if (paramId.includes("EyeBall") || paramId.includes("EYE_BALL")) return 9;
  if (/^Param\d+$/.test(paramId)) return 11;
  return DEFAULT_SPEED;
}

export class Live2DParameterMixer {
  private current = new Map<string, number>();
  private lastTimestamp = 0;

  smooth(target: Map<string, number>, timestampMs: number): Map<string, number> {
    const deltaSeconds = this.lastTimestamp > 0
      ? Math.min(Math.max((timestampMs - this.lastTimestamp) / 1000, 0), 0.1)
      : 1 / 60;
    this.lastTimestamp = timestampMs;

    const result = new Map<string, number>();
    const keys = new Set([...this.current.keys(), ...target.keys()]);

    for (const paramId of keys) {
      const neutral = neutralValue(paramId);
      const previous = this.current.get(paramId) ?? neutral;
      const desired = target.get(paramId) ?? neutral;
      const factor = 1 - Math.exp(-speedForParameter(paramId) * deltaSeconds);
      const next = previous + (desired - previous) * factor;

      // Once a released value has reached neutral, stop overriding it so the
      // model's own blink, motion and physics layers regain full control.
      if (!target.has(paramId) && Math.abs(next - neutral) <= RELEASE_EPSILON) continue;

      result.set(paramId, next);
    }

    this.current = result;
    return new Map(result);
  }

  reset() {
    this.current.clear();
    this.lastTimestamp = 0;
  }
}
