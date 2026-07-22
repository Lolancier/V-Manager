const REACTIONS = [
  {
    kind: "affection",
    test: /喜欢你|爱你|想你|抱抱|亲亲|可爱|老婆|宝贝|最喜欢|陪着我/,
    mood: "blush",
    confidence: 0.92,
    intensity: 0.72,
    durationMs: 1100,
    faceParams: { ParamEyeLOpen: 0.82, ParamEyeROpen: 0.82, ParamMouthForm: 0.3, ParamAngleZ: -5 }
  },
  {
    kind: "surprise",
    test: /真的假的|不会吧|居然|竟然|天哪|哇[！!]?|啊[？?!！!]|怎么会|没想到/,
    mood: "surprised",
    confidence: 0.9,
    intensity: 0.76,
    durationMs: 850,
    faceParams: { ParamEyeLOpen: 1.28, ParamEyeROpen: 1.28, ParamMouthOpenY: 0.24, ParamBrowLY: 0.35, ParamAngleY: 3 }
  },
  {
    kind: "anger",
    test: /气死|生气|讨厌|烦死|离谱|太过分|可恶|混蛋|滚开|闭嘴/,
    mood: "angry",
    confidence: 0.86,
    intensity: 0.62,
    durationMs: 900,
    faceParams: { ParamBrowLY: -0.32, ParamMouthForm: -0.24, ParamAngleZ: 3 }
  },
  {
    kind: "concern",
    test: /难过|伤心|委屈|想哭|好累|累死|压力|焦虑|害怕|不开心|失眠|孤独/,
    mood: "sad",
    confidence: 0.87,
    intensity: 0.56,
    durationMs: 1050,
    faceParams: { ParamBrowLY: -0.2, ParamMouthForm: -0.16, ParamEyeBallY: -0.12, ParamAngleZ: -3 }
  },
  {
    kind: "positive",
    test: /谢谢|感谢|太好了|真棒|厉害|开心|高兴|哈哈|好耶|成功了|做得好|早安|晚安/,
    mood: "happy",
    confidence: 0.84,
    intensity: 0.58,
    durationMs: 900,
    faceParams: { ParamEyeLOpen: 0.86, ParamEyeROpen: 0.86, ParamMouthForm: 0.34, ParamAngleZ: 3 }
  },
  {
    kind: "question",
    test: /[？?]|为什么|怎么|什么|哪里|多少|能不能|可以吗|是不是|有没有|帮我|看看|查一下/,
    mood: "thinking",
    confidence: 0.74,
    intensity: 0.4,
    durationMs: 760,
    faceParams: { ParamEyeBallX: 0.24, ParamEyeBallY: 0.08, ParamAngleZ: -2.5 }
  }
];

export function classifyFastReaction(message) {
  const text = String(message || "").replace(/\s+/g, " ").trim();

  for (const reaction of REACTIONS) {
    if (reaction.test.test(text)) {
      return {
        kind: reaction.kind,
        mood: reaction.mood,
        confidence: reaction.confidence,
        intensity: reaction.intensity,
        durationMs: reaction.durationMs,
        faceParams: { ...reaction.faceParams }
      };
    }
  }

  return {
    kind: "attention",
    mood: "thinking",
    confidence: 0.52,
    intensity: 0.28,
    durationMs: 680,
    faceParams: { ParamEyeBallX: 0.12, ParamAngleZ: -1.5 }
  };
}
