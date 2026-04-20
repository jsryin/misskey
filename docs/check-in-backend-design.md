# Check-In Backend Design

## Goal

为 Misskey 增加可扩展的签到能力，第一阶段优先支持：

- 每个用户每天只能签到一次
- 支持桌面端和手机端共用同一套后端数据
- 支持连续签到、总签到数、月历展示
- 后续可扩展成就、积分、补签、活动奖励

第一阶段采用更稳定的建模方式：`check_in_record` 同时保存实际签到时间 `checkedAt` 和按 `UTC+8` 归一化后的签到日期 `checkInDateUtc8`，不单独保存 `timezone` 字段。

## Recommended Table Design

建议新增主表 `check_in_record`。

### Columns

- `id`: `varchar(32)`，主键
- `userId`: `varchar(32)`，关联 `user.id`
- `checkedAt`: `timestamp with time zone`，实际签到时间
- `checkInDateUtc8`: `date`，按 `UTC+8` 计算后的签到日期
- `source`: `varchar(32)`，签到来源，预留 `manual` / `web` / `mobile`
- `reward`: `jsonb`，奖励快照，默认 `{}`
- `createdAt`: `timestamp with time zone`，可选；如果保留，通常与 `checkedAt` 相同

### Indexes

- 索引：`userId`
- 索引：`checkedAt`
- 唯一索引：`(userId, checkInDateUtc8)`

### Constraints

- `userId` 外键到 `user.id`
- `ON DELETE CASCADE`

## Timezone Rule

既然需要保证多端一致，就必须把“哪一天算同一天”的规则固定在服务端。

第一阶段建议：

- 全站统一按 `UTC+8` 判断“当天”

这意味着：

- 写入时保存 `checkedAt`
- 同时把 `checkedAt` 换算成 `UTC+8` 日期后写入 `checkInDateUtc8`
- 查询“今天是否已签到”时，直接比较 `checkInDateUtc8`
- 连续签到和月历也统一基于 `checkInDateUtc8`

不要让 Web 和移动端各自按本地时区算，否则会出现同一用户在不同端结果不一致。

## Query Model

第一阶段可以只依赖 `check_in_record`，但如果要尽早兼顾较大数据量，建议同时引入 `user_check_in_summary`。

### Can Be Computed Directly

- 今日是否已签到：按 `checkInDateUtc8` 判断
- 月历：按月份范围查询 `checkInDateUtc8`
- 总签到数：`count(*)`
- 连续签到：按 `checkInDateUtc8` 做去重和连续计算

### Why Add a Summary Table

- 首页、移动端、状态接口都是高频读取
- `currentStreak` 和 `totalCheckIns` 不适合每次都从大表实时计算
- 明细表和汇总表职责拆开后，查询成本更稳定

## `user_check_in_summary`

建议增加汇总表 `user_check_in_summary`。

### Columns

- `userId`: `varchar(32)`，主键，关联 `user.id`
- `totalCheckIns`: `integer`，总签到次数
- `currentStreak`: `integer`，当前连续签到天数
- `maxStreak`: `integer`，历史最大连续签到天数
- `lastCheckInAt`: `timestamp with time zone`，最近一次签到时间
- `createdAt`: `timestamp with time zone`
- `updatedAt`: `timestamp with time zone`

### Responsibility Split

- `check_in_record`：保存每次签到历史
- `user_check_in_summary`：保存当前汇总状态

### Why No More Tables Yet

- 先上线更快
- 规则还没定死时，避免双写一致性问题
- 当前只需要明细表和汇总表两层

## Summary Update Logic

签到成功时，除了插入 `check_in_record`，还要同步更新 `user_check_in_summary`。

### Input

- 当前签到时间 `checkedAt`
- 将 `checkedAt` 换算成 `UTC+8` 后得到的当前签到日期

处理过程中可使用两个临时变量：

- `currentCheckInDateUtc8`：本次请求对应的 `UTC+8` 日期
- `lastCheckInDateUtc8`：把 `lastCheckInAt` 换算成 `UTC+8` 后得到的上次签到日期

### Update Rules

如果用户还没有汇总记录：

- 创建一条 `user_check_in_summary`
- `totalCheckIns = 1`
- `currentStreak = 1`
- `maxStreak = 1`
- `lastCheckInAt = checkedAt`

如果用户已经有汇总记录：

1. 将 `lastCheckInAt` 换算成临时变量 `lastCheckInDateUtc8`

2. 如果 `lastCheckInDateUtc8 === currentCheckInDateUtc8`
   - 说明今天已经签过到
   - 不增加 `totalCheckIns`
   - 不更新 streak
   - 接口返回“今天已签到”

3. 如果 `lastCheckInDateUtc8` 是 `currentCheckInDateUtc8` 的前一天
   - `currentStreak += 1`
   - `totalCheckIns += 1`
   - `maxStreak = max(maxStreak, currentStreak)`
   - 更新 `lastCheckInAt`

4. 其他情况
   - 说明连续签到中断
   - `currentStreak = 1`
   - `totalCheckIns += 1`
   - `maxStreak` 保持原值或更新为更大值
   - 更新 `lastCheckInAt`

### Consistency Rule

推荐把下面两步放在同一事务里：

1. 插入 `check_in_record`
2. 更新 `user_check_in_summary`

这样可以避免明细和汇总状态不一致。

## Duplicate Check Strategy

由于已经显式保存 `checkInDateUtc8`，数据库层可以直接用 `(userId, checkInDateUtc8)` 唯一索引限制“一天只能签到一次”。

推荐做法：

- 应用层先查一次今天是否已签到，提升正常路径体验
- 插入时由数据库唯一索引兜底并发
- 唯一冲突统一按“今天已签到”处理

## Recommended API Order

后端实施顺序建议如下：

1. 建 `check_in_record` 实体和 migration
2. 增加 repository DI 注册
3. 实现 `i/check-in/status`
4. 实现 `i/check-in`
5. 实现 `i/check-in/calendar`
6. 最后再接成就和前端

## Endpoint Outline

### `i/check-in/status`

返回：

- `serverDate`
- `isCheckedInToday`
- `currentStreak`
- `totalCheckIns`

其中：

- `isCheckedInToday` 基于 `lastCheckInAt` 换算到 `UTC+8` 后与当前 `UTC+8` 日期比较判断
- `currentStreak` 和 `totalCheckIns` 直接读取汇总表
- 建议一并返回 `maxStreak` 和 `lastCheckInAt`，这样前端 widget 不需要二次拼装摘要卡片

响应示例：

```json
{
  "serverDate": "2026-04-20",
  "checkInDateUtc8": "2026-04-20",
  "isCheckedInToday": false,
  "currentStreak": 6,
  "totalCheckIns": 21,
  "maxStreak": 9,
  "lastCheckInAt": "2026-04-19T02:13:45.000Z"
}
```

### `i/check-in`

流程：

1. 读取当前时间并写入 `checkedAt`
2. 将 `checkedAt` 换算成 `UTC+8` 的 `checkInDateUtc8`
3. 按 `checkInDateUtc8` 判断今天是否已签到
4. 如果未签到，则插入 `check_in_record`
5. 更新 `user_check_in_summary`
6. 返回最新签到状态

如果唯一索引冲突，仍应捕获并按“今天已签到”处理。

建议返回：

- `created`: 本次是否真的创建了签到记录
- `alreadyCheckedIn`: 是否命中了幂等分支
- 最新 `status` 字段，保持和 `i/check-in/status` 相同结构

这样前端可以直接：

- 首次签到时 toast “签到成功”
- 重复点击时 toast “今天已签到”
- 无需再补一次状态查询

响应示例：

```json
{
  "created": true,
  "alreadyCheckedIn": false,
  "serverDate": "2026-04-20",
  "checkInDateUtc8": "2026-04-20",
  "isCheckedInToday": true,
  "currentStreak": 7,
  "totalCheckIns": 22,
  "maxStreak": 9,
  "lastCheckInAt": "2026-04-20T00:05:12.000Z"
}
```

### `i/check-in/calendar`

参数：

- `year`
- `month`

返回：

- 该月已签到日期列表
- 可选奖励摘要

这里的日期列表直接基于 `checkInDateUtc8` 查询得出。

建议直接返回完整日期字符串数组，而不是只返回 day number：

- 前端更容易复用
- 后续支持跨月补签、高亮奖励日时不需要改协议

响应示例：

```json
{
  "year": 2026,
  "month": 4,
  "checkInDateUtc8": [
    "2026-04-01",
    "2026-04-02",
    "2026-04-03",
    "2026-04-20"
  ],
  "rewardSummary": {}
}
```

## Frontend Integration Notes

为了让 Misskey 的日历 widget 可以顺滑接入，前后端契约建议固定为以下交互：

1. widget 初次加载时并行调用 `i/check-in/status` 与 `i/check-in/calendar`
2. widget 展示三块信息：今日状态、连续签到、累计签到
3. 点击“签到”按钮后调用 `i/check-in`
4. 成功后立即 toast“签到成功”
5. 随后弹出一个 Misskey 风格的小弹窗展示当月签到日历
6. 如果重复点击，则后端返回幂等成功，前端提示“今天已签到”并继续允许查看月历

前端月历展示建议：

- 顶部展示当前年月
- 网格展示 7 列自然月日历
- 已签到日期使用主题色高亮
- 今天的日期额外描边
- 底部保留一行说明：签到日期统一按 `UTC+8` 计算

## Rollout Suggestion

建议分两步上线：

1. 先交付后端表结构和三个接口，保证数据口径稳定
2. 再把 widget 改造成签到入口，避免前端先上线后出现 404 或时区口径不一致的问题

## Concurrency and Consistency

推荐策略：

- 应用层先查一次，提升正常路径体验
- 插入时优先由 `(userId, checkInDateUtc8)` 唯一约束兜底
- 捕获唯一冲突后按幂等成功或“今天已签到”处理

## Migration Scope

本次 migration 建议只做：

- 新建 `check_in_record`
- 新建 `user_check_in_summary`
- 建立基础索引
- 建立外键
- 建立 `(userId, checkInDateUtc8)` 唯一索引

## Final Recommendation

第一阶段表结构结论如下：

- 保留 `checkedAt timestamptz`
- 增加 `checkInDateUtc8 date`
- `checkInDateUtc8` 的值固定为 `checkedAt` 换算到 `UTC+8` 后的日期
- 增加 `user_check_in_summary` 作为汇总表
- 使用 `(userId, checkInDateUtc8)` 唯一索引保证一天只能签到一次

这是当前选定的后端建模方式。
