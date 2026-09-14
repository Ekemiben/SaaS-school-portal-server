import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DeviceAdapterInterface, AttendanceCheckInPayload, AttendanceCheckInResult } from './device-adapter.interface.js';
import { ManualAttendanceAdapter } from './manual-attendance.adapter.js';
import { QrAttendanceAdapter } from './qr-attendance.adapter.js';
import { RfidAttendanceAdapter } from './rfid-attendance.adapter.js';
import { BiometricAttendanceAdapter } from './biometric-attendance.adapter.js';
import { ExternalDeviceAdapter } from './external-device.adapter.js';
import { AttendanceMethodType } from '../dto/mark-attendance.dto.js';

@Injectable()
export class DeviceAdapterRegistryService {
  private readonly logger = new Logger(DeviceAdapterRegistryService.name);
  private readonly adapters: Map<AttendanceMethodType, DeviceAdapterInterface> = new Map();

  constructor(
    private readonly manualAdapter: ManualAttendanceAdapter,
    private readonly qrAdapter: QrAttendanceAdapter,
    private readonly rfidAdapter: RfidAttendanceAdapter,
    private readonly biometricAdapter: BiometricAttendanceAdapter,
    private readonly externalDeviceAdapter: ExternalDeviceAdapter,
  ) {
    this.registerAdapter(this.manualAdapter);
    this.registerAdapter(this.qrAdapter);
    this.registerAdapter(this.rfidAdapter);
    this.registerAdapter(this.biometricAdapter);
    this.registerAdapter(this.externalDeviceAdapter);
  }

  private registerAdapter(adapter: DeviceAdapterInterface) {
    this.adapters.set(adapter.method, adapter);
  }

  getAdapter(method: AttendanceMethodType): DeviceAdapterInterface {
    const adapter = this.adapters.get(method);
    if (!adapter) {
      throw new BadRequestException(`Unsupported attendance method: "${method}"`);
    }
    return adapter;
  }

  async processCheckIn(
    tenantId: string,
    method: AttendanceMethodType,
    actorUserId: string,
    payload: AttendanceCheckInPayload,
  ): Promise<AttendanceCheckInResult> {
    const adapter = this.getAdapter(method);
    return adapter.processCheckIn(tenantId, actorUserId, payload);
  }
}
