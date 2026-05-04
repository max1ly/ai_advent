import type { Request } from "express";

export interface GatewayRequest extends Request {
  id?: string;
}
