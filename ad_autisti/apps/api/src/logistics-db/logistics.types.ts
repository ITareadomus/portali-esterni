export type LgDriverCredentialRow = {
  driver_id: number;
  password_hash: string;
  active: boolean;
};

export type LgDriverVehicleAssignment = {
  vehicle_id?: number | null;
  vehicle_name?: string | null;
  vehicle_task_id?: number | null;
  vehicle_pms_code?: string | null;
};

export type LgDriverDayRow = {
  driver_id: number;
  work_date: Date | string | null;
  start_time: string | null;
  end_time: string | null;
  available: boolean | null;
  selected: boolean;
  vehicle_assignment: LgDriverVehicleAssignment | string | null;
};

export type LgDriverRosterRow = {
  driver_id: number;
  work_date: Date | string;
  name: string | null;
  lastname: string | null;
  start_time: string | null;
  end_time: string | null;
  available: boolean | null;
};

export type LgTimelineRow = {
  id: number;
  work_date: Date | string;
  driver_id: number;
  task_id: number | null;
  logistic_code: number | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  checkin_date: Date | string | null;
  checkout_date: Date | string | null;
  checkin_time: string | null;
  checkout_time: string | null;
  straordinaria: boolean | null;
  customer_name: string | null;
  start_time: string | null;
  end_time: string | null;
  sequence: number | null;
  travel_time: number | null;
  logistics_task_kind: string | null;
};

export type LgCleanerContextRow = {
  task_id: number;
  cleaner_id: number;
  cleaner_alias: string | null;
  sequence: number | null;
  start_time: string | null;
  end_time: string | null;
};
