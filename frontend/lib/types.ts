export type Level = "seats" | "standing" | "crowded" | "unknown";
export type Confidence = "low" | "medium" | "high";
export type Prefer = "fast" | "comfort";

export interface Stop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  routes: number;
}

/** A place the user picked: a GTFS stop or a raw map point. `value` is what the API expects. */
export interface Place {
  label: string;
  value: string; // stop_id or "lat,lon"
  lat?: number;
  lon?: number;
}

export interface LegPoint {
  stop_id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Leg {
  route: string;
  board: LegPoint;
  alight: LegPoint;
  board_time: string;
  alight_time: string;
  minutes_on_bus: number;
  stops: number;
  path: [number, number][];
  stretch_levels: Level[];
}

export interface OptionCrowding {
  level: Level;
  avg_index: number | null;
  peak_level: Level;
  crowded_share: number;
  data_coverage: number;
  confidence: Confidence;
}

export interface JourneyOption {
  routes: string[];
  transfers: number;
  leave_after_min: number;
  leave_at: string;
  arrive_at: string;
  total_minutes: number;
  trip_minutes: number;
  walk_to_first_min: number;
  walk_from_last_min: number;
  crowding: OptionCrowding;
  legs: Leg[];
}

export interface JourneysResponse {
  origin: { stop_id: string; name: string; walk_min: number }[];
  destination: { stop_id: string; name: string; walk_min: number }[];
  options: JourneyOption[];
  note: string | null;
  disclaimer: string;
}

export interface HeatRoute {
  route: string;
  index: number;
  riders_per_bus: number;
  crowded_share: number;
  stretches: number;
  trips: number;
  worst_from: string;
  worst_to: string;
  worst_riders_per_bus: number;
  level: Level;
}

export interface HeatStretch {
  route: string;
  stretch: number;
  from_stop: string;
  to_stop: string;
  lat: number;
  lon: number;
  level: Level;
  index: number;
  riders_per_bus: number;
  trips: number;
  confidence: Confidence;
}

export interface CrowdingStretch {
  stretch: number;
  from_stop: string;
  to_stop: string;
  lat: number;
  lon: number;
  level: Level;
  index: number;
  riders_per_bus: number;
  confidence: Confidence;
}

export interface ProfileHour {
  hour: number;
  index: number;
  riders_per_bus: number;
  level: Level;
  share_medium_or_high: number;
}

export interface NetworkHour {
  hour: number;
  cells: number;
  mean_index: number | null;
  seats_share: number | null;
  standing_share: number | null;
  crowded_share: number | null;
}
