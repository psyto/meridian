import * as anchor from "@coral-xyz/anchor";

export function formatTxResult(
  signature: string,
  json: boolean
): string {
  if (json) {
    return JSON.stringify({ signature }, null, 2);
  }
  return `Transaction confirmed: ${signature}`;
}

export function formatSimulateResult(
  result: any,
  json: boolean
): string {
  if (json) {
    return JSON.stringify(result, null, 2);
  }
  const logs = result?.value?.logs ?? [];
  const cu = result?.value?.unitsConsumed ?? "N/A";
  return `Simulation successful (${cu} CU)\n${logs.join("\n")}`;
}

export function serializeAccount(obj: any, json: boolean): string {
  const plain = serializePlain(obj);
  if (json) {
    return JSON.stringify(plain, null, 2);
  }
  return formatTable(plain);
}

function serializePlain(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (anchor.BN.isBN(obj)) return obj.toString();
  if (obj.toBase58) return obj.toBase58();
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === "number") {
      return "0x" + Buffer.from(obj).toString("hex");
    }
    return obj.map(serializePlain);
  }
  if (typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializePlain(value);
    }
    return result;
  }
  return obj;
}

function formatTable(obj: any, indent = 0): string {
  const lines: string[] = [];
  const pad = " ".repeat(indent);
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      lines.push(formatTable(value as any, indent + 2));
    } else {
      lines.push(`${pad}${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

export function formatTimestamp(bn: anchor.BN): string {
  const ts = bn.toNumber();
  if (ts === 0) return "N/A";
  return new Date(ts * 1000).toISOString();
}

export function formatPreset(preset: any): string {
  if (preset.sss1) return "SSS-1";
  if (preset.sss2) return "SSS-2";
  if (preset.custom) return "Custom";
  return JSON.stringify(preset);
}
