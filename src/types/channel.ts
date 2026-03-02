/**
 * 渠道（Channel）类型定义
 * 
 * Channel 表示一个具体的聊天渠道，如飞书群聊、单聊、Discord 频道等。
 * 格式规范：`平台/标识符`
 * 
 * 示例：
 * - 飞书单聊：feishu/ou_xxx
 * - 飞书群聊：feishu/oc_xxx
 * - Discord：discord/server_id/channel_id
 * - Slack：slack/workspace/channel
 * - 系统：system/default
 */

/**
 * 渠道 ID 类型
 * 格式：`平台/标识符`（如 feishu/ou_xxx）
 */
export type ChannelId = string;

/**
 * 渠道平台类型
 */
export type ChannelPlatform = 
  | "feishu"    // 飞书
  | "discord"   // Discord
  | "slack"     // Slack
  | "telegram"  // Telegram
  | "wechat"    // 微信
  | "system"    // 系统内部
  | "cli"       // 命令行
  | "agent"     // Agent 内部
  | string;     // 其他自定义平台

/**
 * 飞书渠道类型
 */
export type FeishuChannelType =
  | "ou"  // 单聊（Open User ID）
  | "oc"  // 群聊（Open Chat ID）
  | "og"; // 群组（Open Group ID）

/**
 * 渠道状态
 */
export type ChannelStatus = "active" | "completed" | "error" | "archived";

/**
 * 渠道接口定义
 * 表示一个聊天渠道的完整信息
 */
export interface Channel {
  /** 渠道唯一标识符，格式：平台/标识符 */
  id: ChannelId;
  /** 渠道显示名称 */
  name: string;
  /** 渠道平台 */
  platform: ChannelPlatform;
  /** 平台内标识符（如 ou_xxx, oc_xxx） */
  platform_id: string;
  /** 渠道创建时间（ISO 8601 格式） */
  created_at: string;
  /** 渠道最后更新时间（ISO 8601 格式） */
  updated_at: string;
  /** 渠道状态 */
  status: ChannelStatus;
  /** 渠道元数据 */
  metadata?: {
    /** 使用的模型 */
    model?: string;
    /** 工作目录 */
    cwd?: string;
    /** 任务描述 */
    task?: string;
    /** 标签列表 */
    tags?: string[];
    /** 其他自定义元数据 */
    [key: string]: unknown;
  };
  /** 渠道统计信息 */
  stats?: ChannelStats;
}

/**
 * 渠道统计信息
 */
export interface ChannelStats {
  /** 事件总数 */
  event_count: number;
  /** 总输入 Token 数 */
  total_input_tokens: number;
  /** 总输出 Token 数 */
  total_output_tokens: number;
  /** 持续时间（毫秒） */
  duration_ms: number;
}

/**
 * 渠道摘要接口定义
 * 用于列表展示的精简渠道信息
 */
export interface ChannelSummary {
  /** 渠道唯一标识符 */
  id: ChannelId;
  /** 渠道显示名称 */
  name: string;
  /** 渠道创建时间（ISO 8601 格式） */
  created_at: string;
  /** 渠道最后更新时间（ISO 8601 格式） */
  updated_at: string;
  /** 渠道状态 */
  status: ChannelStatus;
  /** 事件数量 */
  event_count: number;
  /** 首条消息预览 */
  preview?: string;
}

/**
 * 解析渠道 ID
 * @param channelId - 渠道 ID，格式：平台/标识符
 * @returns 解析结果，包含平台和标识符
 */
export function parseChannelId(channelId: ChannelId): {
  platform: ChannelPlatform;
  platformId: string;
  segments: string[];
} {
  const segments = channelId.split("/");
  const platform = segments[0] || "unknown";
  const platformId = segments.slice(1).join("/") || channelId;
  return { platform, platformId, segments };
}

/**
 * 构建渠道 ID
 * @param platform - 平台名称
 * @param platformId - 平台内标识符
 * @returns 渠道 ID
 */
export function buildChannelId(platform: ChannelPlatform, platformId: string): ChannelId {
  return `${platform}/${platformId}`;
}

/**
 * 判断是否为飞书渠道
 */
export function isFeishuChannel(channelId: ChannelId): boolean {
  return channelId.startsWith("feishu/");
}

/**
 * 判断飞书渠道类型
 * @param channelId - 渠道 ID
 * @returns 飞书渠道类型（ou/oc/og）或 null
 */
export function getFeishuChannelType(channelId: ChannelId): FeishuChannelType | null {
  if (!isFeishuChannel(channelId)) return null;
  const { platformId } = parseChannelId(channelId);
  if (platformId.startsWith("ou_")) return "ou";
  if (platformId.startsWith("oc_")) return "oc";
  if (platformId.startsWith("og_")) return "og";
  return null;
}

/**
 * 判断是否为飞书单聊
 */
export function isFeishuDirectMessage(channelId: ChannelId): boolean {
  return getFeishuChannelType(channelId) === "ou";
}

/**
 * 判断是否为飞书群聊
 */
export function isFeishuGroupChat(channelId: ChannelId): boolean {
  return getFeishuChannelType(channelId) === "oc";
}

/**
 * 规范化渠道 ID
 * 将各种格式的输入转换为标准的 平台/标识符 格式
 * @param input - 原始输入
 * @param defaultPlatform - 默认平台
 * @returns 规范化的渠道 ID
 */
export function normalizeChannelId(input: string, defaultPlatform: ChannelPlatform = "system"): ChannelId {
  if (!input || input === "unknown") {
    return `${defaultPlatform}/unknown`;
  }
  
  if (input.includes("/")) {
    return input;
  }
  
  const prefix = input.split(/[_:]/)[0];
  switch (prefix) {
    case "ou":
    case "oc":
    case "og":
      return `feishu/${input}`;
    case "user":
    case "chat":
      return `feishu/${input.slice(prefix.length + 1)}`;
    case "agent":
      return `agent/${input.slice(6)}`;
    default:
      return `${defaultPlatform}/${input}`;
  }
}
