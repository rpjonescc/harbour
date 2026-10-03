import { PageHeader } from "@/components/explain/PageHeader";
import { TermLine } from "@/components/explain/TermLine";
import { AddDeviceButton } from "@/components/settings/AddDeviceButton";
import { DeviceList } from "@/components/settings/DeviceList";
import { Panel } from "@/components/ui/Panel";
import { listDevices } from "@/lib/auth/devices";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { devicesIntro, devicesVerdict } from "@/lib/explain/devices";

export default async function DevicesPage() {
  const session = await requireSession();
  const devices = listDevices(getDb(), session.login, session.passkeyId);
  const { HARBOUR_TIMEZONE, HARBOUR_LOCALE } = getConfig();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Devices"
        page="devices"
        verdict={devicesVerdict(devices)}
        intro={
          <p>
            <TermLine line={devicesIntro(session.login)} />
          </p>
        }
      />
      <Panel className="px-4">
        <DeviceList devices={devices} timeZone={HARBOUR_TIMEZONE} locale={HARBOUR_LOCALE} />
      </Panel>
      <AddDeviceButton />
    </div>
  );
}
