import { Box, Text } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import { COLORS } from "./theme.js";

type FakeOverlayProps = {
  height: number;
};

function rand(min: number, max: number, decimals = 1): string {
  const value = Math.random() * (max - min) + min;
  return value.toFixed(decimals);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nudgeFloat(
  current: number,
  min: number,
  max: number,
  maxDelta: number,
  decimals = 1,
): string {
  const delta = (Math.random() - 0.5) * 2 * maxDelta;
  return clamp(current + delta, min, max).toFixed(decimals);
}

function nudgeInt(current: number, min: number, max: number, maxDelta: number): number {
  const delta = Math.round((Math.random() - 0.5) * 2 * maxDelta);
  return clamp(current + delta, min, max);
}

function progressBar(percent: number, width = 15): string {
  const filled = Math.round((percent / 100) * width);
  return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
}

type ContainerInfo = {
  name: string;
  cpu: string;
  mem: string;
  status: string;
};

const CONTAINER_STATUSES = ["running", "running", "running", "running", "restarting"];

type MonitorData = {
  hostname: string;
  upDays: number;
  upHours: number;
  upMins: number;
  load: [string, string, string];
  cpu: number;
  memPercent: number;
  memUsed: string;
  memTotal: string;
  swapPercent: number;
  swapUsed: string;
  swapTotal: string;
  diskPercent: number;
  diskUsed: string;
  diskTotal: string;
  containers: ContainerInfo[];
  netDown: string;
  netUp: string;
  refreshTime: string;
};

function generateData(): MonitorData {
  const cpuVal = parseFloat(rand(15, 85));
  const memPercentVal = parseFloat(rand(40, 80));
  const memTotalVal = parseFloat(rand(15, 32, 1));
  const memUsedVal = (memTotalVal * memPercentVal) / 100;
  const swapPercentVal = parseFloat(rand(5, 25));
  const swapTotalVal = parseFloat(rand(8, 16, 1));
  const swapUsedVal = (swapTotalVal * swapPercentVal) / 100;
  const diskPercentVal = parseFloat(rand(50, 90));
  const diskTotalVal = parseFloat(rand(200, 500, 1));
  const diskUsedVal = (diskTotalVal * diskPercentVal) / 100;
  const hostnameNum = String(randInt(1, 9)).padStart(2, "0");

  return {
    hostname: `prod-api-${hostnameNum}.internal`,
    upDays: randInt(10, 90),
    upHours: randInt(0, 23),
    upMins: randInt(0, 59),
    load: [rand(0.1, 1.5, 2), rand(0.1, 1.2, 2), rand(0.1, 1.0, 2)],
    cpu: cpuVal,
    memPercent: memPercentVal,
    memUsed: memUsedVal.toFixed(1),
    memTotal: memTotalVal.toFixed(1),
    swapPercent: swapPercentVal,
    swapUsed: swapUsedVal.toFixed(1),
    swapTotal: swapTotalVal.toFixed(1),
    diskPercent: diskPercentVal,
    diskUsed: diskUsedVal.toFixed(1),
    diskTotal: diskTotalVal.toFixed(1),
    containers: [
      { name: "api-server", cpu: rand(0.5, 5), mem: `${rand(0.8, 2.0)}G`, status: "running" },
      { name: "worker-01", cpu: rand(3, 15), mem: `${rand(0.4, 1.2)}G`, status: "running" },
      { name: "redis", cpu: rand(0.0, 0.5), mem: `${rand(0.1, 0.5)}G`, status: "running" },
      { name: "postgres", cpu: rand(0.5, 4), mem: `${rand(1.5, 3.0)}G`, status: "running" },
      { name: "nginx", cpu: rand(0.0, 0.2), mem: `${rand(0.05, 0.2)}G`, status: "running" },
    ],
    netDown: rand(5, 25),
    netUp: rand(3, 15),
    refreshTime: new Date().toLocaleTimeString("en-US", { hour12: false }),
  };
}

function nudgeData(prev: MonitorData): MonitorData {
  const cpuVal = parseFloat(nudgeFloat(prev.cpu, 10, 95, 8));
  const memPercentVal = parseFloat(nudgeFloat(prev.memPercent, 30, 90, 3));
  const memTotalVal = parseFloat(prev.memTotal);
  const memUsedVal = (memTotalVal * memPercentVal) / 100;
  const swapPercentVal = parseFloat(nudgeFloat(prev.swapPercent, 2, 35, 2));
  const swapTotalVal = parseFloat(prev.swapTotal);
  const swapUsedVal = (swapTotalVal * swapPercentVal) / 100;
  const diskPercentVal = parseFloat(nudgeFloat(prev.diskPercent, 40, 95, 1));
  const diskTotalVal = parseFloat(prev.diskTotal);
  const diskUsedVal = (diskTotalVal * diskPercentVal) / 100;
  const upMins = nudgeInt(prev.upMins, 0, 59, 3);

  return {
    hostname: prev.hostname,
    upDays: prev.upDays,
    upHours: upMins > 59 ? prev.upHours + 1 : prev.upHours,
    upMins,
    load: [
      nudgeFloat(parseFloat(prev.load[0]), 0.05, 2.0, 0.15, 2),
      nudgeFloat(parseFloat(prev.load[1]), 0.05, 1.8, 0.1, 2),
      nudgeFloat(parseFloat(prev.load[2]), 0.05, 1.5, 0.08, 2),
    ],
    cpu: cpuVal,
    memPercent: memPercentVal,
    memUsed: memUsedVal.toFixed(1),
    memTotal: prev.memTotal,
    swapPercent: swapPercentVal,
    swapUsed: swapUsedVal.toFixed(1),
    swapTotal: prev.swapTotal,
    diskPercent: diskPercentVal,
    diskUsed: diskUsedVal.toFixed(1),
    diskTotal: prev.diskTotal,
    containers: prev.containers.map((c) => ({
      ...c,
      cpu: nudgeFloat(parseFloat(c.cpu), 0.0, 20, 1.5),
      mem: `${nudgeFloat(parseFloat(c.mem), 0.05, 4.0, 0.15)}G`,
      status: CONTAINER_STATUSES[randInt(0, CONTAINER_STATUSES.length - 1)],
    })),
    netDown: nudgeFloat(parseFloat(prev.netDown), 1, 40, 3),
    netUp: nudgeFloat(parseFloat(prev.netUp), 0.5, 20, 2),
    refreshTime: new Date().toLocaleTimeString("en-US", { hour12: false }),
  };
}

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

export function FakeOverlay({ height }: FakeOverlayProps): React.JSX.Element {
  const [data, setData] = useState<MonitorData>(() => generateData());
  const [spinnerIdx, setSpinnerIdx] = useState(0);

  useEffect(() => {
    const dataTimer = setInterval(() => {
      setData((prev) => nudgeData(prev));
    }, 3000);

    const spinnerTimer = setInterval(() => {
      setSpinnerIdx((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 250);

    return () => {
      clearInterval(dataTimer);
      clearInterval(spinnerTimer);
    };
  }, []);

  return (
    <Box flexDirection="column" height={height} paddingX={2} paddingY={1}>
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={COLORS.primary}>
          {"──── SYSTEM MONITOR "}
          {SPINNER_FRAMES[spinnerIdx]}
          {" ────"}
        </Text>
      </Box>

      <Box flexDirection="column" paddingLeft={2} gap={0}>
        <Text>
          {"  "}
          <Text color={COLORS.muted}>{"HOSTNAME".padEnd(9)}</Text>
          <Text>{data.hostname}</Text>
        </Text>
        <Text>
          {"  "}
          <Text color={COLORS.muted}>{"UPTIME".padEnd(9)}</Text>
          <Text>
            {data.upDays}d {data.upHours}h {data.upMins}m
          </Text>
        </Text>
        <Text>
          {"  "}
          <Text color={COLORS.muted}>{"LOAD AVG".padEnd(9)}</Text>
          <Text>
            {data.load[0]} {data.load[1]} {data.load[2]}
          </Text>
        </Text>

        <Text>{""}</Text>

        <Text>
          {"  "}
          <Text color={COLORS.muted}>{"CPU".padEnd(5)}</Text>
          <Text color="green">{progressBar(data.cpu)}</Text>
          <Text> {data.cpu.toFixed(1)}%</Text>
        </Text>
        <Text>{""}</Text>
        <Text>
          {"  "}
          <Text color={COLORS.muted}>{"MEM".padEnd(5)}</Text>
          <Text color="yellow">{progressBar(data.memPercent)}</Text>
          <Text>
            {" "}
            {data.memPercent.toFixed(1)}% {data.memUsed}G / {data.memTotal}G
          </Text>
        </Text>
        <Text>{""}</Text>
        <Text>
          {"  "}
          <Text color={COLORS.muted}>{"SWAP".padEnd(5)}</Text>
          <Text color="cyan">{progressBar(data.swapPercent)}</Text>
          <Text>
            {" "}
            {data.swapPercent.toFixed(1)}% {data.swapUsed}G / {data.swapTotal}G
          </Text>
        </Text>
        <Text>{""}</Text>
        <Text>
          {"  "}
          <Text color={COLORS.muted}>{"DISK".padEnd(5)}</Text>
          <Text color={data.diskPercent > 80 ? "red" : "green"}>
            {progressBar(data.diskPercent)}
          </Text>
          <Text>
            {" "}
            {data.diskPercent.toFixed(1)}% {data.diskUsed}G / {data.diskTotal}G
          </Text>
        </Text>

        <Text>{""}</Text>

        <Text>
          {"  "}
          <Text color={COLORS.muted}>{"CONTAINER         CPU    MEM     STATUS"}</Text>
        </Text>
        {data.containers.map((c) => (
          <Text key={c.name}>
            {"  "}
            <Text>{c.name.padEnd(18)}</Text>
            <Text>{`${c.cpu}%`.padEnd(7)}</Text>
            <Text>{c.mem.padEnd(8)}</Text>
            <Text color={c.status === "running" ? "green" : "yellow"}>{c.status}</Text>
          </Text>
        ))}

        <Text>{""}</Text>

        <Text>
          {"  "}
          <Text color={COLORS.muted}>NET I/O </Text>
          <Text>
            {"\u2193"} {data.netDown} MB/s {"\u2191"} {data.netUp} MB/s
          </Text>
        </Text>
      </Box>

      <Box flexGrow={1} />

      <Box justifyContent="center">
        <Text dimColor>Last refresh: {data.refreshTime} | q to quit</Text>
      </Box>
    </Box>
  );
}
