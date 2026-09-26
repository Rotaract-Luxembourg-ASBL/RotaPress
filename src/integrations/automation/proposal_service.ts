import "server-only";
import { db } from "@/infrastructure/database/client";
import { services } from "@/composition/services";
import { AutomationProposalService } from "./AutomationProposalService";

export const automationProposals = new AutomationProposalService(db, services);
