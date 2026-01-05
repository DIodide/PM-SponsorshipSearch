import { ComponentExample } from "@/components/component-example";
import { Button } from "@/components/ui/button";
import { HomeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

export default function Page() {
  return (<>
    <Button variant="default" size="lg">
      <Link href="/" className="flex items-center gap-2">
        <HugeiconsIcon icon={HomeIcon} size={24} />
        Home
      </Link>
    </Button>  
</>);
}