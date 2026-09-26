import "server-only";
import { CalendarReader } from "@/features/calendar/CalendarReader";
import { CalendarService } from "@/features/calendar/CalendarService";
import { CalendarSubscriptionService } from "@/features/calendar/CalendarSubscriptionService";
import { CalendarNotificationRunner } from "@/features/calendar/CalendarNotificationRunner";
import { CalendarSourceService } from "@/features/calendar/CalendarSourceService";
import { CalendarFeedClient } from "@/features/calendar/providers/CalendarFeedClient";
import { MemberAccountService } from "@/features/members/MemberAccountService";
import { DomainService } from "@/core/organization/DomainService";
import { db } from "@/infrastructure/database/client";
import { AuthorizationService } from "@/core/authorization/AuthorizationService";
import { FeatureService } from "@/core/features/FeatureService";
import { InstallationService } from "@/core/installation/InstallationService";
import { OrganizationService } from "@/core/organization/OrganizationService";
import { MembershipService } from "@/features/members/MembershipService";
import { RequestLimiter } from "@/core/RequestLimiter";
import { googleAuthStore } from "@/core/auth/google_configuration";
import { GoogleAuthSettingsService } from "@/core/auth/GoogleAuthSettingsService";
import { config } from "@/core/config";
import { resolve } from "node:path";
import { MediaService } from "@/features/media/MediaService";
import { LocalStorageDriver } from "@/infrastructure/storage/LocalStorageDriver";
import { CmsService } from "@/features/cms/CmsService";
import { CmsPreviewService } from "@/features/cms/CmsPreviewService";
import { CmsPartnerUsage } from "@/features/cms/CmsPartnerUsage";
import { PartnerService } from "@/features/partners/PartnerService";
import { ProjectService } from "@/features/projects/ProjectService";
import { ProjectReader } from "@/features/projects/ProjectReader";
import { CmsRepository } from "@/features/cms/CmsRepository";
import { CmsScopePolicy } from "@/features/cms/CmsScopePolicy";
import { CmsPublicationSchedule } from "@/features/cms/CmsPublicationSchedule";
import { CmsPublicationRunner } from "@/features/cms/CmsPublicationRunner";
import { scheduledActor } from "@/core/auth/scheduled_actor";
import { CmsStarterService } from "@/features/cms/CmsStarterService";
import { CmsKitService } from "@/features/cms/kits/CmsKitService";
import { WebsiteSetupService } from "@/features/cms/WebsiteSetupService";
import {
  FormService,
  SubmissionService,
  FormNotificationRunner,
} from "@/features/forms";
import { mailer, emailDelivery, calendarEmailPreferences } from "./email";
import { EmailSettingsService } from "@/integrations/email/EmailSettingsService";
import { ScopedEmailTemplateService } from "@/integrations/email/ScopedEmailTemplateService";
import { RegistrationService } from "@/features/events/RegistrationService";
import { GuestAccessService } from "@/features/guests/GuestAccessService";
import { GuestPurchaseService } from "@/features/guests/GuestPurchaseService";
import { EventEntryService } from "@/features/events/EventEntryService";
import { EventDrawService } from "@/features/events/EventDrawService";
import { LumaGuestAccessSource } from "@/integrations/luma/LumaGuestAccessSource";
import { EventService } from "@/features/events";
import { EventDirectoryService } from "@/features/events/EventDirectoryService";
import { EventModuleService } from "@/features/events/EventModuleService";
import { EventTemplateService } from "@/features/events/EventTemplateService";
import { EventCancellationService } from "@/features/events/EventCancellationService";
import { CmsEventCopyService } from "@/features/cms/CmsEventCopyService";
import { FormEventCopyService } from "@/features/forms/FormEventCopyService";
import { InboxService } from "@/features/forms/InboxService";
import { FormWebhookService } from "@/features/forms/FormWebhookService";
import { FormDeletionService } from "@/features/forms/FormDeletionService";
import { FormWebhookRunner } from "@/features/forms/FormWebhookRunner";
import { WebhookClient } from "@/infrastructure/http/WebhookClient";
import { EventWebsiteService } from "@/features/events/EventWebsiteService";
import { EventEditorialService } from "@/features/events/EventEditorialService";
import { EventReadinessService } from "@/features/events/EventReadinessService";
import { EventPackageService } from "@/features/events/EventPackageService";
import { EventPrizeService } from "@/features/events/EventPrizeService";
import {
  EventLumaLinkService,
  LumaAvailabilityService,
} from "@/integrations/luma";
import { CredentialCipher } from "@/integrations/luma/CredentialCipher";
import { LumaClient } from "@/integrations/luma/LumaClient";
import { LumaConnectionService } from "@/integrations/luma/LumaConnectionService";
import { LumaConnectionAccess } from "@/integrations/luma/LumaConnectionAccess";
import { LumaEventSyncAccess } from "@/integrations/luma/LumaEventSyncAccess";
import { LumaApiEventService } from "@/integrations/luma/LumaApiEventService";
import { LumaGuestSyncService } from "@/integrations/luma/LumaGuestSyncService";
import { LumaReconciliationJobs } from "@/integrations/luma/LumaReconciliationJobs";
import { LumaReconciliationRunner } from "@/integrations/luma/LumaReconciliationRunner";
import { LumaWebhookService } from "@/integrations/luma/LumaWebhookService";

const authorization = new AuthorizationService(db);
const storagePath =
  new URL(config.DATABASE_URL).pathname === "/rotapress_test"
    ? ".local/test-uploads"
    : ".data/uploads";
const media = new MediaService(
  db,
  authorization,
  new LocalStorageDriver(resolve(storagePath)),
);
const forms = new FormService(db, authorization);
const members = new MembershipService(db, authorization, forms);
const events = new EventService(db, authorization);
const eventDirectory = new EventDirectoryService(db, authorization, media);
const eventModules = new EventModuleService(db, events);
const cms = new CmsService(
  db,
  authorization,
  media,
  forms,
  events,
  eventModules,
);
const kits = new CmsKitService(
  db,
  authorization,
  media,
  cms,
  forms,
  ["127.0.0.1", "localhost", "[::1]"].includes(
    new URL(config.APP_URL).hostname,
  ),
);
const websiteSetup = new WebsiteSetupService(
  db,
  authorization,
  media,
  cms,
  kits,
);
const publicationScope = new CmsScopePolicy(
  db,
  authorization,
  new CmsRepository(db),
  events,
  eventModules,
  media,
);
const registrations = new RegistrationService(db, authorization, members);
const lumaAvailability = new LumaAvailabilityService(db, authorization);
const lumaLinks = new EventLumaLinkService(
  db,
  authorization,
  events,
  eventModules,
  registrations,
  lumaAvailability,
);
const eventPackages = new EventPackageService(
  db,
  authorization,
  events,
  eventModules,
  registrations,
  lumaLinks,
);
const credentialCipher = new CredentialCipher(
  config.INTEGRATION_ENCRYPTION_KEY,
);
const lumaClient = new LumaClient(
  config.LUMA_FIXTURE_ORIGIN
    ? { mode: "fixture", origin: config.LUMA_FIXTURE_ORIGIN }
    : {
        mode: config.LUMA_API_REQUESTS_ENABLED === "true" ? "live" : "blocked",
      },
);
const lumaConnectionAccess = new LumaConnectionAccess(
  lumaAvailability,
  credentialCipher,
  lumaClient.mode,
);
const lumaEventSyncAccess = new LumaEventSyncAccess(
  authorization,
  events,
  eventModules,
  registrations,
);
const lumaGuestSync = new LumaGuestSyncService(
  db,
  events,
  lumaEventSyncAccess,
  lumaConnectionAccess,
  lumaClient,
  scheduledActor,
);
const lumaJobs = new LumaReconciliationJobs(
  db,
  events,
  lumaEventSyncAccess,
  lumaConnectionAccess,
  scheduledActor,
);
const guests = new GuestAccessService(
  db,
  events,
  eventModules,
  registrations,
  new LumaGuestAccessSource(),
);
const purchases = new GuestPurchaseService(
  db,
  events,
  eventModules,
  guests,
  lumaEventSyncAccess,
  lumaConnectionAccess,
  lumaClient,
  scheduledActor,
);
const eventEntries = new EventEntryService(db, events, eventModules, purchases);
const eventWebsite = new EventWebsiteService(
  db,
  authorization,
  events,
  eventModules,
  cms,
  lumaLinks,
);
const calendarReader = new CalendarReader(db, () =>
  eventWebsite.publicList("en"),
);
export const services = {
  projects: new ProjectService(db, authorization, media),
  projectReader: new ProjectReader(db),
  emailTemplates: new ScopedEmailTemplateService(db, authorization),
  email: new EmailSettingsService(
    db,
    authorization,
    emailDelivery,
    config.APP_URL,
  ),
  calendarEmailPreferences,
  calendar: new CalendarService(db, authorization, calendarReader),
  calendarSources: new CalendarSourceService(
    db,
    authorization,
    new CalendarFeedClient(config.CALENDAR_FEED_REQUESTS_ENABLED === "true"),
    credentialCipher,
    scheduledActor,
  ),
  calendarSubscriptions: new CalendarSubscriptionService(db, calendarReader),
  calendarNotifications: new CalendarNotificationRunner(
    db,
    calendarReader,
    mailer,
    config.APP_URL,
  ),
  formDeletion: new FormDeletionService(db, authorization),
  eventDirectory,
  account: new MemberAccountService(db),
  domains: new DomainService(db, authorization, config.APP_URL),
  purchases,
  eventEntries,
  eventDraws: new EventDrawService(db, events, eventModules, eventEntries),
  eventPackages,
  eventPrizes: new EventPrizeService(
    db,
    authorization,
    events,
    eventModules,
    media,
  ),
  eventReadiness: new EventReadinessService(
    db,
    authorization,
    events,
    eventModules,
    cms,
    forms,
    registrations,
    lumaLinks,
  ),
  previews: new CmsPreviewService(db, cms, events, media),
  eventEditorial: new EventEditorialService(
    db,
    authorization,
    events,
    eventModules,
    cms,
  ),
  features: new FeatureService(db, authorization),
  lumaWebhook: new LumaWebhookService(
    db,
    authorization,
    lumaAvailability,
    credentialCipher,
    config.APP_URL,
  ),
  guests,
  lumaJobs,
  lumaReconciliation: new LumaReconciliationRunner(db, lumaJobs, lumaGuestSync),
  partners: new PartnerService(db, authorization, media, new CmsPartnerUsage()),
  publicationSchedule: new CmsPublicationSchedule(
    db,
    publicationScope,
    scheduledActor,
  ),
  publications: new CmsPublicationRunner(
    db,
    cms,
    publicationScope,
    scheduledActor,
  ),
  lumaApiEvents: new LumaApiEventService(
    db,
    events,
    lumaEventSyncAccess,
    lumaConnectionAccess,
    lumaClient,
  ),
  lumaConnection: new LumaConnectionService(
    db,
    authorization,
    lumaAvailability,
    credentialCipher,
    lumaClient,
  ),
  lumaAvailability,
  lumaLinks,
  eventTemplates: new EventTemplateService(
    db,
    authorization,
    events,
    eventModules,
    new CmsEventCopyService(db, authorization, media, events, eventModules),
    new FormEventCopyService(),
    registrations,
    media,
  ),
  eventCancellation: new EventCancellationService(
    db,
    authorization,
    events,
    registrations,
  ),
  registrations,
  authorization,
  events,
  eventModules,
  eventWebsite,
  media,
  cms,
  starter: new CmsStarterService(cms),
  kits,
  websiteSetup,
  installation: new InstallationService(db, websiteSetup),
  organization: new OrganizationService(db, authorization, googleAuthStore),
  googleAuth: new GoogleAuthSettingsService(
    db,
    authorization,
    googleAuthStore,
    config.APP_URL,
  ),
  members,
  forms,
  submissions: new SubmissionService(db, authorization, members),
  inbox: new InboxService(db, authorization),
  formWebhooks: new FormWebhookService(
    db,
    authorization,
    credentialCipher,
    config.FORM_WEBHOOK_REQUESTS_ENABLED === "true",
  ),
  webhookNotifications: new FormWebhookRunner(
    db,
    credentialCipher,
    new WebhookClient(config.FORM_WEBHOOK_REQUESTS_ENABLED === "true"),
    config.APP_URL,
  ),
  notifications: new FormNotificationRunner(db, mailer, config.APP_URL),
  limiter: new RequestLimiter(db),
};
