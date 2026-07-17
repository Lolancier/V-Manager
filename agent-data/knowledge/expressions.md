# 芊芊（Live2D）表情参数表

通过 set_mood 的 face_params 字段可以精细控制以下 Live2D 参数。
所有值必须是数字，超出范围会被自动 clamp。

## 眼睛特效（0=关, 1=开）

| 参数 | 说明 |
|------|------|
| Param52 | 豆豆眼 |
| Param53 | 星星眼 |
| Param54 | 脸红 |
| Param69 | 脸红2 |
| Param55 | 黑脸 |
| Param56 | 眼泪 |
| Param57 | 眼珠转动 |
| Param58 | 问号 |
| Param88 | 问号2 |
| Param59 | 流汗 |
| Param87 | 无语 |
| Param64 | 钱眼 |
| Param66 | 爱心眼 |
| Param67 | 轮回眼 |
| Param68 | 空白眼 |

## 嘴部特效（0=关, 1=开）

| 参数 | 说明 |
|------|------|
| Param70 | 吐舌 |
| Param76 | 嘟嘴 |
| Param83 | 鼔嘴 |
| Param89 | 星星 |
| Param90 | 生气标记 |

## 造型切换（0=关, 1=开）

| 参数 | 说明 |
|------|------|
| Param84 | 长发 |
| Param85 | 双马尾 |
| Param86 | 垂耳 |

## 道具（0=关, 1=开）

| 参数 | 说明 |
|------|------|
| Param95 | 镜子 |
| Param96 | 狐狸 |
| Param97 | 笔记本R |
| Param98 | 笔记本L |
| Param99 | 打游戏 |
| Param100 | 抱狐狸 |
| Param101 | 扇子 |
| Param102 | 话筒 |
| Param103 | 比心 |

## 连续参数

| 参数 | 范围 | 说明 |
|------|------|------|
| ParamEyeLOpen | 0-2 | 左眼开闭 0=全闭 1=默认 2=全开 |
| ParamEyeROpen | 0-2 | 右眼开闭 |
| ParamEyeBallX | -1到1 | 双眼珠左右 -1=左看 1=右看 |
| ParamEyeBallY | -1到1 | 双眼珠上下 -1=下看 1=上看 |
| ParamBrowLY | -1到1 | 双眉上下 -1=压低 1=抬高 |
| ParamBrowLForm | -1到1 | 双眉水平变形 1=囧 |
| ParamMouthOpenY | 0-1 | 嘴巴张合 0=闭 1=全开 |
| ParamMouthForm | -1到1 | 嘴角弧度 -1=下弯 1=上扬 |
| ParamAngleX | -30到30 | 左右扭头 -30=左转 30=右转 |
| ParamAngleY | -30到30 | 抬头低头 -30=低头 30=抬头 |
| ParamAngleZ | -30到30 | 左右歪头 -30=左歪 30=右歪 |

## 常用表情预设

### 开心笑
face_params: {"ParamMouthForm":0.4,"ParamEyeLOpen":0.65,"ParamEyeROpen":0.65,"ParamAngleZ":5}

### 惊讶张嘴
face_params: {"ParamMouthOpenY":0.6,"ParamEyeLOpen":1.5,"ParamEyeROpen":1.5,"ParamBrowLY":0.5}

### 难过低头
face_params: {"ParamAngleY":-8,"ParamBrowLY":-0.4,"ParamMouthForm":-0.3,"ParamAngleZ":-6}

### 皱眉生气
face_params: {"ParamBrowLY":-0.5,"ParamBrowLForm":0.6,"ParamMouthForm":-0.4,"Param90":1,"Param55":1}

### 歪头疑惑
face_params: {"ParamAngleZ":-12,"ParamBrowLY":0.4,"ParamAngleY":5}

### 害羞
face_params: {"ParamEyeLOpen":0.75,"ParamEyeROpen":0.75,"ParamBrowLY":0.2,"Param54":1}
