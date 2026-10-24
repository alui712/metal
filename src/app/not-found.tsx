import { Compass } from "lucide-react";
import { EmptyState, PageContainer } from "@/components/ui/page";

export default function NotFound() {
  return (
    <PageContainer className="max-w-3xl pt-16 md:pt-24">
      <EmptyState
        icon={Compass}
        title="This memory doesn’t exist"
        description="The page or session you’re looking for isn’t here. It may have been removed, or the link is wrong."
        action={{ href: "/", label: "Back to home" }}
      />
    </PageContainer>
  );
}
