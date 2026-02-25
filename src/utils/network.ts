import os from "node:os";

/**
 * 현재 머신의 로컬 네트워크 IP 주소를 반환한다
 * WiFi/이더넷 인터페이스에서 IPv4 주소를 찾는다
 */
export function getLocalIp(): string {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name];
    if (!addrs) continue;

    for (const addr of addrs) {
      // IPv4, 외부 접근 가능한 주소만
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }

  return "127.0.0.1";
}
