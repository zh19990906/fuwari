# YOLO 云台项目系列 PR 说明草稿

## Summary

- 注册独立的 `YOLO 云台项目` 文档分组；
- 新增八篇覆盖架构、视觉端、K2 控制端、硬件接线、设备树修复、PCA9685 渐进验证、故障排查和部署运维的中文文档；
- 完整记录本次 NanoPi K2 从错误扫描 HDMI DDC 到启用 `i2c-A`、出现 `/dev/i2c-1` 并检测到 PCA9685 `0x40` 的实机链路；
- 明确 VCC/V+、独立舵机电源、共地、断电改线、单通道窄范围测试和立即断电条件；
- 区分代码确认、实机验证、环境相关结论和待验证事项；
- 新增静态文档契约并接入现有文档测试入口。

## Real hardware evidence captured

```text
Ubuntu 16.04.7 LTS
Linux 3.14.29
initial adapter: i2c-0 / i2c_gpio.32
0x50 = UU on HDMI DDC
/i2c@c1108500 = disabled
status changed to okay with DTB backup
new adapter: i2c-1
PCA9685 detection: 0x40 = 40
```

## Documentation contract

- `published` and `updated`: `2026-08-05`;
- `contentType: docs`;
- `docGroup: yolo-gimbal`;
- no per-post author;
- no real credentials or private IPv4 addresses;
- small servo examples use 1500/1475/1525 microseconds;
- environment-dependent bus numbers and DTB nodes are clearly scoped;
- incomplete hardware acceptance items remain explicitly marked as pending.

## Pending hardware validation

- project `Pca9685ServoBackend` initialization on the physical board;
- CH0 and CH1 small-range motion;
- Pan/Tilt safe pulse calibration;
- full dual-machine tracking;
- network-loss return-to-center acceptance;
- long-duration and multi-browser stability testing.
