import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import styles from "./ideCompatibility.module.css";

const editors = [
  { name: "VS Code", detail: "Marketplace", href: "https://code.visualstudio.com", src: "/brands/ide/vscode.svg", size: 34 },
  { name: "Cursor", detail: "VS Code based", href: "https://cursor.com", src: "/brands/ide/cursor.svg", size: 34 },
  { name: "Windsurf", detail: "VS Code based", href: "https://windsurf.com", src: "/brands/ide/windsurf.svg", size: 34 },
  { name: "VSCodium", detail: "Open VSX", href: "https://vscodium.com", src: "/brands/ide/vscodium.svg", size: 34 },
];

export default function IdeCompatibility() {
  return (
    <section className={styles.section} aria-labelledby="ide-support-heading">
      <div className={styles.heading}>
        <h2 id="ide-support-heading">Scan from the editor you already use.</h2>
        <Link href="/cli">See the local workflow <ArrowUpRight /></Link>
      </div>
      <div className={styles.editorList} aria-label="Supported editors">
        {editors.map(({ name, detail, href, src, size }) => (
          <a className={styles.editor} href={href} key={name} target="_blank" rel="noreferrer">
            <Image className={styles.logo} src={src} alt={`${name} logo`} width={size} height={size} unoptimized />
            <span><strong>{name}</strong><small>{detail}</small></span>
          </a>
        ))}
      </div>
      <p className={styles.disclaimer}>Editor names and logos belong to their respective owners. No endorsement implied.</p>
    </section>
  );
}
