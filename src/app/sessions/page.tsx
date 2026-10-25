import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SessionsOverview } from "@/components/timemachine/sessions-overview";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { getDb } from "@/server/db/client";
import { mediaUrls } from "@/server/timemachine/media-urls";
import { timeMachineOverview } from "@/server/timemachine/sessions";

export const metadata: Metadata = { title: "Time Machine" };

export default function SessionsPage() {
  return (
    <PageTransition>
      <PageContainer className="pb-24">
        <PageHeader
          eyebrow="Time Machine"
          title={
            <>
              Every night you played,{" "}
              <span className="font-display font-normal italic text-accent-ink">in order.</span>
            </>
          }
          description={
            <>
              A session is a run of recordings made close together — a new one starts after the break you choose below. Moments found by Smart Clip
              appear on each session’s timeline; open a night to relive them in order.{" "}
              <Link href="/sessions/demo" className="font-medium text-accent-ink hover:text-white">
                See the demo sessions →
              </Link>
            </>
          }
        />
        <Suspense fallback={<div className="mt-10 h-72 animate-pulse rounded-3xl bg-surface-2/60" />}>
          <Overview />
        </Suspense>
      </PageContainer>
    </PageTransition>
  );
}

async function Overview() {
  await connection();
  return <SessionsOverview data={timeMachineOverview(getDb(), mediaUrls())} />;
}
