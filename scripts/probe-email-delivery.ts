import {
  createEmailDeliveryProbeId,
  emailDeliveryProbeConfiguration,
} from "../src/lib/email-delivery-probe";
import { sendEmailDeliveryProbe } from "../src/lib/email";
import {
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";

const commandTiming = startOperatorCommand();

async function main() {
  const { recipient } = emailDeliveryProbeConfiguration();
  const probeId = createEmailDeliveryProbeId();
  await sendEmailDeliveryProbe(recipient, probeId);
  return { probeId };
}

void main()
  .then((result) => {
    const completed = finishOperatorCommand(commandTiming);
    console.info(JSON.stringify({
      level: "info",
      event: "email_delivery_probe_accepted",
      startedAt: completed.startedAt,
      acceptedAt: completed.finishedAt,
      durationMs: completed.durationMs,
      ...result,
    }));
  })
  .catch((error) => {
    console.error(JSON.stringify(operatorCommandFailureEntry(
      "email_delivery_probe",
      error,
      commandTiming,
    )));
    process.exitCode = 1;
  });
