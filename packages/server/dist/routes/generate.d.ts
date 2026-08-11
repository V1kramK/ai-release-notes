import { Router } from "express";
import type { AuditPort } from "../ports/index.js";
export declare function generateRouter(audit: AuditPort): Router;
