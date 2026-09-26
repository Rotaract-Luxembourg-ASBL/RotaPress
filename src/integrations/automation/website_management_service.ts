import "server-only";
import { db } from "@/infrastructure/database/client";
import { services } from "@/composition/services";
import { WebsiteManagementService } from "./WebsiteManagementService";

export const websiteManagement = new WebsiteManagementService(
  db,
  services.authorization,
  services.cms,
);
