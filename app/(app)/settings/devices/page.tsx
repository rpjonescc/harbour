import { PageHeader } from "@/components/explain/PageHeader";
import { AddDeviceButton } from "@/components/settings/AddDeviceButton";
import { DeviceList } from "@/components/settings/DeviceList";
import { Panel } from "@/components/ui/Panel";
import { listDevices } from "@/lib/auth/devices";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";

export default async function DevicesPage() {
  const session = await requireSession();
  const devices = listDevices(getDb(), session.login, session.passkeyId);
  const { HARBOUR_TIMEZONE, HARBOUR_LOCALE } = getConfig();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Devices"
        page="devices"
        intro={
          <p>
            The devices that can open Harbour as {session.login}. Each signs in with a passkey: your
            fingerprint, face or screen lock.
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
