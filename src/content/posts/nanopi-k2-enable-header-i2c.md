---
title: Ubuntu 16.04 / Linux 3.14 的 NanoPi K2：启用 40Pin 排针 I²C
published: 2026-08-05
updated: 2026-08-05
description: 记录从误扫 HDMI DDC、识别 disabled 设备树节点，到启用 i2c-A 并检测 PCA9685 0x40 的实机过程。
tags: [NanoPi K2, I2C, Device Tree, DTB, PCA9685]
category: YOLO 云台
contentType: docs
docGroup: yolo-gimbal
docSection: 硬件与总线
docOrder: 50
draft: false
---

本文记录一台 NanoPi K2 上真实完成的修复过程。目标是在 40Pin 物理 Pin 3/Pin 5 上启用 I²C，并让 PCA9685 在地址 `0x40` 被 Linux 检测到。

本次环境：

```text
Ubuntu 16.04.7 LTS (Xenial Xerus)
Linux 3.14.29 厂商内核
固定启动文件 /boot/nanopi-k2.dtb
无 Armbian overlay、extlinux.conf 或 *Env.txt
```

> 设备树节点地址、pinctrl、启动文件和最终总线编号都与镜像和内核有关。本文不能直接套用到其他 NanoPi K2 镜像、其他 Amlogic 板卡或主线内核。

## 最初现象

逻辑接线为：

```text
K2 Pin 1 -> PCA9685 VCC
K2 Pin 3 -> PCA9685 SDA
K2 Pin 5 -> PCA9685 SCL
K2 Pin 6 -> PCA9685 GND
```

舵机和外部 V+ 电源均未连接。

系统只显示一个适配器：

```bash
i2cdetect -l
```

```text
i2c-0   i2c   i2c_gpio.32   I2C adapter
```

设备节点也只有：

```text
/dev/i2c-0
```

扫描 `0x40`：

```bash
i2cdetect -y 0 0x40 0x40
```

结果：

```text
40: --
```

`--` 只表示当前被扫描的适配器上没有设备应答，不能直接推断 PCA9685 损坏或 SDA/SCL 接反。

## 容易犯的错误：把 i2c_gpio.32 当成总线 32

`i2c_gpio.32` 是 Linux 平台设备名称，不是用户空间总线编号。下面命令是错误的：

```bash
i2cdetect -y 32 0x40 0x40
```

因为系统不存在 `/dev/i2c-32`。

可访问的编号始终以以下输出为准：

```bash
i2cdetect -l
ls -l /dev/i2c-*
```

当时唯一可访问的是 `i2c-0`。

## 检查 i2c-0 使用的 GPIO

```bash
cat /sys/class/i2c-adapter/i2c-0/name
readlink -f /sys/class/i2c-adapter/i2c-0/device

mount -t debugfs debugfs /sys/kernel/debug 2>/dev/null || true
cat /sys/kernel/debug/gpio | grep -i -B3 -A3 -E 'i2c|sda|scl'
dmesg | grep -iE 'i2c|gpio'
```

本机输出：

```text
i2c_gpio.32
gpio-153 (sda) in hi
gpio-154 (scl) in hi
i2c-gpio i2c_gpio.32: using pins 153 (SDA) and 154 (SCL)
```

看到 SDA/SCL 为 `hi` 说明总线没有明显被某个设备持续拉低，但仍不能证明该适配器连接 40Pin。

## 完整扫描暴露了错误总线

```bash
i2cdetect -y 0
```

关键结果：

```text
50: UU -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
```

`UU` 表示该地址已被内核驱动占用。结合内核日志：

```text
hdmitx: system: unmux DDC for gpio read edid
```

可以判断 `i2c-0` 实际服务于 HDMI DDC/EDID，而不是 40Pin 排针。显示设备的 EDID 常见于 I²C 地址 `0x50`。

这一步纠正了两个错误认识：

- 看到 `i2c-0` 不代表它就是排针 I²C；
- PCA9685 电源灯亮，不代表当前扫描的是它所在的总线。

不要在 HDMI DDC 总线上反复运行全地址扫描。`i2cdetect` 会向地址发送探测事务，应该只在明确的适配器和必要地址范围内使用。

## 确认系统版本和启动方式

```bash
cat /etc/os-release
uname -a
cat /proc/cmdline
ls -la /boot
find /boot -maxdepth 3 -type f \( \
  -name '*.dtb' -o \
  -name '*.dtbo' -o \
  -name '*Env.txt' -o \
  -name 'extlinux.conf' \
\) -print
```

本机只发现：

```text
/boot/Image
/boot/nanopi-k2.dtb
/boot/ramdisk.img
```

没有 overlay 配置入口，说明需要检查固定 DTB，而不是照抄 Armbian 的 overlay 指令。

## 检查正在运行的设备树

```bash
echo '===== DT I2C nodes ====='
find /proc/device-tree -type d | grep -Ei 'i2c|iic' | while read -r d; do
  echo "[$d]"
  if [ -f "$d/compatible" ]; then
    printf '  compatible: '
    tr '\0' ' ' < "$d/compatible"
    echo
  fi
  if [ -f "$d/status" ]; then
    printf '  status: '
    tr -d '\0' < "$d/status"
    echo
  else
    echo '  status: <not present>'
  fi
done
```

本机发现四个硬件控制器全部禁用：

```text
/proc/device-tree/i2c@c1108d20  status: disabled
/proc/device-tree/i2c@c11087e0  status: disabled
/proc/device-tree/i2c@c11087c0  status: disabled
/proc/device-tree/i2c@c1108500  status: disabled
```

同时存在 pinmux 分组：

```text
/proc/device-tree/pinmux/a_i2c
/proc/device-tree/pinmux/b_i2c
/proc/device-tree/pinmux/c_i2c
/proc/device-tree/pinmux/d_i2c
```

FriendlyELEC 官方 40Pin 定义中，物理 Pin 3/Pin 5 是 I2C_SDA_A / I2C_SCK_A。因此本机目标是 `i2c-A`，对应节点 `/i2c@c1108500`。

## 安装设备树工具

先检查：

```bash
command -v fdtget
command -v fdtput
command -v dtc
```

缺失时安装：

```bash
apt-get update
apt-get install -y device-tree-compiler
```

Ubuntu 16.04 已停止常规支持，软件源可能失效。若安装失败，应先修复软件源或在另一台兼容 Linux 主机上处理 DTB，不要在工具不完整时直接覆盖启动文件。

## 修改前确认目标节点

```bash
tr -d '\0' < /proc/device-tree/i2c@c1108500/dev_name
echo
tr -d '\0' < /proc/device-tree/i2c@c1108500/status
echo
```

本机预期：

```text
i2c-A
disabled
```

若 `dev_name` 不是 `i2c-A`，或节点不存在，应停止并重新分析当前 DTB。

## 备份 DTB

必须先确保有恢复手段：

- 能把 SD 卡或存储介质连接到另一台 Linux 主机；
- 知道 `/boot` 分区位置；
- 已保存原始 `nanopi-k2.dtb`；
- 最好使用备用介质测试。

在 K2 上执行：

```bash
cd /boot

BACKUP="nanopi-k2.dtb.bak-$(date +%Y%m%d-%H%M%S)"
cp -a nanopi-k2.dtb "$BACKUP"
cp -a nanopi-k2.dtb nanopi-k2-i2c.dtb

echo "backup: /boot/$BACKUP"
```

所有修改先作用于副本 `nanopi-k2-i2c.dtb`。

## 使用 fdtput 启用 i2c-A

```bash
fdtput -t s nanopi-k2-i2c.dtb /i2c@c1108500 status okay
```

读取验证：

```bash
fdtget -t s nanopi-k2-i2c.dtb /i2c@c1108500 dev_name
fdtget -t s nanopi-k2-i2c.dtb /i2c@c1108500 status
```

本机输出：

```text
i2c-A
okay
```

这里仅修改 `status`。不要删除或重建 `reg`、`clocks`、`resets`、`pinctrl-0` 等原有属性。

## 反编译验证

```bash
dtc -I dtb -O dts \
  -o /tmp/nanopi-k2-i2c.dts \
  nanopi-k2-i2c.dtb

grep -A15 'i2c@c1108500' /tmp/nanopi-k2-i2c.dts
```

本机节点包含：

```dts
i2c@c1108500 {
    compatible = "amlogic, meson-i2c";
    dev_name = "i2c-A";
    status = "okay";
    reg = <0x0 0xc1108500 0x0 0x20>;
    device_id = <0x1>;
    pinctrl-names = "default";
    pinctrl-0 = <0x11>;
    #address-cells = <0x1>;
    #size-cells = <0x0>;
    use_pio = <0x0>;
    master_i2c_speed = <0x493e0>;
};
```

进一步确认 `pinctrl-0` 引用仍对应 `a_i2c`：

```bash
grep -n -B15 -A20 'phandle = <0x11>' /tmp/nanopi-k2-i2c.dts
```

反编译时 phandle 数值可能随编译工具变化，不能把 `0x11` 当作跨系统固定值。关键是目标节点仍引用正确的 A 组 I²C pinctrl。

## 替换启动 DTB

只有在确认有离线恢复方式后执行：

```bash
cd /boot
cp -a nanopi-k2.dtb nanopi-k2.dtb.backup-before-i2c
cp -a nanopi-k2-i2c.dtb nanopi-k2.dtb
sync
reboot
```

修改错误可能导致系统无法启动。远程无人值守设备不应在没有串口、备用介质或现场恢复人员时执行。

## 重启后的结果

```bash
i2cdetect -l
ls -l /dev/i2c-*
dmesg | grep -iE 'i2c-A|meson-i2c|aml_i2c'
```

本机出现新的 `/dev/i2c-1`。原来的 `i2c-0` 仍是 HDMI DDC，不应拿来控制 PCA9685。

受限扫描：

```bash
i2cdetect -y 1 0x40 0x40
```

成功输出：

```text
40: 40
```

这证明：

- 排针 I²C 控制器已注册；
- Pin 3/Pin 5 的 SDA/SCL 工作；
- PCA9685 逻辑供电和地址可应答；
- 项目配置应使用本机实际总线 `i2c_bus: 1`。

`i2c-1` 是本次镜像的结果，不是 NanoPi K2 的永久规则。升级内核、修改设备树或增加其他适配器后编号可能变化。

## 项目配置

本机当前配置：

```yaml
servo:
  backend: pca9685
  frequency_hz: 50
  i2c_bus: 1
  i2c_address: 0x40
```

仍应先运行：

```bash
i2cdetect -l
```

再决定配置中的 `i2c_bus`。

## 启动失败恢复

若修改后无法启动：

1. 彻底断电；
2. 取下存储介质；
3. 连接到另一台 Linux 主机；
4. 挂载其 `/boot` 分区；
5. 删除或改名错误的 `nanopi-k2.dtb`；
6. 将 `nanopi-k2.dtb.backup-before-i2c` 或时间戳备份复制回 `nanopi-k2.dtb`；
7. 执行 `sync` 后安全卸载；
8. 放回 K2 重试启动。

不要删除所有备份。验证新 DTB 稳定启动多次后，仍建议保留一份已知可用版本。

## 排查决策树

### `i2cdetect -l` 只有 i2c_gpio.32

先全扫描一次确认是否出现 `0x50 UU`，再结合 `hdmitx`/DDC 日志判断是否为 HDMI 总线。检查 `/proc/device-tree` 中硬件 I²C 节点状态。

### 新总线没有出现

检查：

```bash
tr -d '\0' < /proc/device-tree/i2c@c1108500/status
dmesg | grep -iE 'i2c|pinctrl|clock|reset'
```

确认启动程序实际加载的是被替换的 `/boot/nanopi-k2.dtb`。

### 新总线存在但 `0x40` 为 `--`

回到电气排查：VCC 是否约 3.3V、GND 是否共地、SDA/SCL 是否接对、地址焊桥是否仍为默认 `0x40`、杜邦线是否接触可靠。

### 地址显示 `UU`

表示地址被内核驱动占用，不等于故障。先确认该地址属于什么设备和驱动，不要强行使用用户空间程序同时访问。

## 安全清单

- [ ] 明确当前镜像、内核和启动方式；
- [ ] 确认目标是 Pin 3/Pin 5 的 i2c-A；
- [ ] 不把 `i2c_gpio.32` 当作 `/dev/i2c-32`；
- [ ] 不在 HDMI DDC 上反复扫描；
- [ ] 修改前备份原始 DTB；
- [ ] 有离线恢复介质和步骤；
- [ ] 只修改目标节点 `status`；
- [ ] 用 `fdtget` 和 `dtc` 验证副本；
- [ ] 重启后以实际 `i2cdetect -l` 决定总线编号；
- [ ] PCA9685 先只接逻辑线，不接舵机电源。

## 参考资料

- FriendlyELEC NanoPi K2：<https://wiki.friendlyelec.com/wiki/index.php/NanoPi_K2>
- Linux I²C 用户空间接口：<https://docs.kernel.org/i2c/dev-interface.html>
- Debian `i2cdetect` 手册：<https://manpages.debian.org/i2c-tools/i2cdetect.8.en.html>
- Devicetree 规范：<https://devicetree-specification.readthedocs.io/>
- Device Tree Compiler：<https://git.kernel.org/pub/scm/utils/dtc/dtc.git/>
