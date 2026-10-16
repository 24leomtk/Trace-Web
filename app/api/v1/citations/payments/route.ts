import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { recordCitationPayment } from "@/lib/actions/citations"
import { citationPaymentSchema } from "@/validations/admin"

export const dynamic = "force-dynamic"

/** Record a fine payment (any-counter receiving; issuer needs countersign). */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(citationPaymentSchema, await parseJsonBody(request))
  return recordCitationPayment({
    recordId: body.recordId,
    amount: body.amount,
    receiptNo: body.receiptNo || undefined,
    note: body.note || undefined,
    payerName: body.payerName,
    paymentMethod: body.paymentMethod,
    channel: body.channel,
    receivingBranchId: body.receivingBranchId || undefined,
    countersignedBy: body.countersignedBy || undefined,
  })
})
