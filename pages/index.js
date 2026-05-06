import fs from "node:fs";
import path from "node:path";
import Head from "next/head";
import Script from "next/script";

export async function getStaticProps() {
  const shellPath = path.join(process.cwd(), "public", "shell.html");
  const shell = fs.readFileSync(shellPath, "utf8");
  const assetVersion = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());
  return { props: { shell, assetVersion } };
}

export default function Home({ shell, assetVersion }) {
  return (
    <>
      <Head>
        <title>FinVault</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href={`/styles.css?v=${assetVersion}`} />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: shell }} />
      <Script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js" strategy="beforeInteractive" />
      <Script src={`/app.js?v=${assetVersion}`} strategy="afterInteractive" />
    </>
  );
}
