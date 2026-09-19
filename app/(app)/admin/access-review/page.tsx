import { AccessReviewBoard } from "@/components/app/access-review"

export default function AccessReviewPage() {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Access review</h1>
        <p className="text-sm text-muted-foreground">
          Periodic recertification — who holds an account, whether it is
          still used, and where transition guards are biting. No case data.
        </p>
      </header>
      <AccessReviewBoard />
    </div>
  )
}
