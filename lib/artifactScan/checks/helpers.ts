import type { Finding, Severity, SourceFile } from "../types";
export const isDocFile = (name: string) => /\.(md|mdx|txt|rst|adoc)$/i.test(name);
export const lineAt = (text: string, index: number) => text.slice(0, index).split(/\r?\n/).length;
export const snippetAt = (text: string, index: number) => text.split(/\r?\n/)[lineAt(text, index) - 1]?.trim().slice(0, 240);
export const inFence = (text: string, index: number) => (text.slice(0, index).match(/```/g)?.length ?? 0) % 2 === 1;
export const finding = (file: SourceFile, category: Finding["category"], title: string, description: string, remediation: string, severity: Severity, index: number): Finding => ({ severity, category, title, description, remediation, file: file.path, line: lineAt(file.content, index), snippet: snippetAt(file.content, index) });
export const safeUrl = (value: string) => {
  if (/^\//.test(value)) return true;
  try { const host = new URL(value).hostname.toLowerCase(); return ["example.com", "example.org", "example.net", "localhost", "127.0.0.1", "0.0.0.0", "httpbin.org"].some(x => host === x || host.endsWith(`.${x}`)); } catch { return false; }
};
export const matches = (text: string, re: RegExp) => { const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`; return [...text.matchAll(new RegExp(re.source, flags))]; };
