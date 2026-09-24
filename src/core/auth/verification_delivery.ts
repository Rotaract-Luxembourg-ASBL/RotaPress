import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { DomainError } from "../DomainError";

type DeliveryResult = {
  failure?: { code: string; message: string; status: number };
};
const deliveryResult = new AsyncLocalStorage<DeliveryResult>();

/** Better Auth awaits email callbacks but absorbs their errors. Keep the outcome
 * in this request only; never retain a recipient, credential, OTP or auth token. */
export async function sendVerificationEmail(
  send: () => Promise<void>,
): Promise<void> {
  const result = deliveryResult.getStore();
  if (!result) throw new Error("EMAIL_DELIVERY_CONTEXT_REQUIRED");
  try {
    await send();
  } catch (error) {
    result.failure =
      error instanceof DomainError
        ? { code: error.code, message: error.message, status: error.status }
        : {
            code: "EMAIL_DELIVERY_UNAVAILABLE",
            message:
              "The email could not be sent. Ask the server administrator to check the sending connection, then try again.",
            status: 422,
          };
  }
}

export async function withVerificationDelivery(
  operation: () => Promise<Response>,
): Promise<Response> {
  const result: DeliveryResult = {};
  return deliveryResult.run(result, async () => {
    // No Better Auth background handler is configured: the callback finishes
    // before this resolves. All code generation/validation remains library-owned.
    const response = await operation();
    if (!result.failure) return response;
    await response.body?.cancel();
    const { code, message, status } = result.failure;
    return Response.json(
      { code, message },
      {
        status,
        headers: { "Cache-Control": "no-store, private" },
      },
    );
  });
}
