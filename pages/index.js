import fs from "node:fs";
import path from "node:path";
import Head from "next/head";
import Script from "next/script";

export async function getStaticProps() {
  const shellPath = path.join(process.cwd(), "public", "shell.html");
  const shell = fs.readFileSync(shellPath, "utf8");
  return { props: { shell } };
}

export default function Home({ shell }) {
  return (
    <>
      <Head>
        <title>FinVault</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/styles.css" />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: shell }} />
      <Script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js" strategy="beforeInteractive" />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
