/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { LogLevel } from '@framework/live2dcubismframework';
import { resolvePublicAssetUrl } from '../publicAssetUrl';

/**
 * Sample Appで使用する定数
 */

// Canvas width and height pixel values, or dynamic screen size ('auto').
export const CanvasSize: { width: number; height: number } | 'auto' = 'auto';

// キャンバスの数
export const CanvasNum = 1;

// 画面
export const ViewScale = 1.0;
export const ViewMaxScale = 2.0;
export const ViewMinScale = 0.8;

export const ViewLogicalLeft = -1.0;
export const ViewLogicalRight = 1.0;
export const ViewLogicalBottom = -1.0;
export const ViewLogicalTop = 1.0;

export const ViewLogicalMaxLeft = -2.0;
export const ViewLogicalMaxRight = 2.0;
export const ViewLogicalMaxBottom = -2.0;
export const ViewLogicalMaxTop = 2.0;

export type ModelResource = {
  id: string;
  directory: string;
  fileName: string;
};

export const ModelResources: ModelResource[] = [
  { id: 'qianqian', directory: resolvePublicAssetUrl('live2d/qianqian/芊芊/'), fileName: '芊芊.model3.json' },
  { id: 'hiyori', directory: resolvePublicAssetUrl('live2d/hiyori/'), fileName: 'Hiyori.model3.json' },
  { id: 'epsilon', directory: resolvePublicAssetUrl('live2d/epsilon_free/'), fileName: 'Epsilon_free.model3.json' }
];

let activeModelId = 'qianqian';
let customModelResource: ModelResource | null = null;

export function setActiveModelId(modelId: string): void {
  activeModelId = ModelResources.some((model) => model.id === modelId) ? modelId : 'qianqian';
  customModelResource = null;
}

export function setActiveModelResource(resource: ModelResource): void {
  activeModelId = resource.id;
  customModelResource = resource;
}

export function getActiveModelResource(): ModelResource {
  return customModelResource ?? ModelResources.find((model) => model.id === activeModelId) ?? ModelResources[0];
}

// シェーダー相対パス
export const ShaderPath = resolvePublicAssetUrl('live2d-official/shaders/WebGL/');

// モデルの後ろにある背景の画像ファイル
export const BackImageName = 'back_class_normal.png';

// 歯車
export const GearImageName = 'icon_gear.png';

// 終了ボタン
export const PowerImageName = 'CloseNormal.png';

// モデル定義---------------------------------------------
// モデルを配置したディレクトリ名の配列
// ディレクトリ名とmodel3.jsonの名前を一致させておくこと
export const ModelDir: string[] = [
  '芊芊'
];
export const ModelDirSize: number = ModelDir.length;

// モデルにモーションが定義されていない場合でも SDK 初期化が通るよう、
// フォールバックとして定義。実際のモーションは ParameterAnimator が担当。
export const MotionGroupIdle = 'Idle';
export const MotionGroupTapBody = 'TapBody';

// 外部定義ファイル（json）と合わせる
export const HitAreaNameHead = 'Head';
export const HitAreaNameBody = 'Body';

// モーションの優先度定数
export const PriorityNone = 0;
export const PriorityIdle = 1;
export const PriorityNormal = 2;
export const PriorityForce = 3;

// MOC3の整合性検証オプション
export const MOCConsistencyValidationEnable = true;
// motion3.jsonの整合性検証オプション
export const MotionConsistencyValidationEnable = true;

// デバッグ用ログの表示オプション
export const DebugLogEnable = false;
export const DebugTouchLogEnable = false;

// Frameworkから出力するログのレベル設定
export const CubismLoggingLevel: LogLevel = LogLevel.LogLevel_Warning;

// デフォルトのレンダーターゲットサイズ
export const RenderTargetWidth = 1900;
export const RenderTargetHeight = 1000;
