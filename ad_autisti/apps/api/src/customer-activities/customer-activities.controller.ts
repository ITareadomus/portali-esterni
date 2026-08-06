import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { CustomerCalendarActivitiesResponse, CustomerTodayActivitiesResponse } from "@adam/types";
import { CustomerSessionGuard, type CustomerSessionRequest } from "../customer-auth/customer-session.guard";
import { CustomerActivitiesService } from "./customer-activities.service";
import { CustomerCalendarActivitiesDto } from "./dto/customer-calendar-activities.dto";
import { CustomerTodayActivitiesDto } from "./dto/customer-today-activities.dto";

@ApiTags("customer-activities")
@Controller("customer/activities")
export class CustomerActivitiesController {
  constructor(
    @Inject(CustomerActivitiesService)
    private readonly customerActivities: CustomerActivitiesService,
  ) {}

  @Get("today")
  @UseGuards(CustomerSessionGuard)
  @ApiOkResponse({
    schema: {
      example: {
        date: { ymd: "2026-07-17" },
        activities: [
          {
            id: 1,
            referenceId: "ABC123",
            structureId: 10,
            operationId: 2,
            activityId: 3,
            checkout: "2026-07-17",
            checkoutTime: "10:00",
            checkoutPax: 2,
            checkin: "2026-07-17",
            checkinTime: "15:00",
            checkinPax: 2,
            noShow: 0,
            deletedAtClient: null,
            cleanedByUs: 44,
            startwork: 0,
            startworkAt: null,
            startreport: 0,
            startreportAt: null,
            cleaned: 0,
            closed: 0,
            deleted: 0,
            sequence: null,
            updatedAt: null,
            deletedAt: null,
            taskStatus: 1,
            structure: {
              id: 10,
              customerId: 123,
              aptCode: "A01",
              logisticCode: 9001,
              name: "Apartment A01",
              address1: "Via Roma 1",
              city: "Milano",
              postcode: "20100",
              alertKeys: 0,
              structureKeys: null,
              customer: { id: 123, name: "Customer", color: "#ffffff" },
              state: { isoCode: "MI" },
            },
            operation: { id: 2, name: "Pulizia" },
            activity: { id: 3, name: "Ordinaria" },
            assignedUser: { id: 44, name: "Mario", lastname: "Rossi" },
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid customer session." })
  today(
    @Req() request: CustomerSessionRequest,
    @Query() body: CustomerTodayActivitiesDto,
  ): Promise<CustomerTodayActivitiesResponse> {
    return this.customerActivities.getTodayForCustomer(request.customerSession!, {
      includeNoShow: body.includeNoShow ?? false,
      languageId: body.languageId,
      orderBy: body.orderBy,
      orderDirection: body.orderDirection,
    });
  }

  @Get("calendar")
  @UseGuards(CustomerSessionGuard)
  @ApiOkResponse({
    schema: {
      example: {
        range: { startDate: "2026-07-01", endDate: "2026-07-31" },
        activities: [],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid customer session." })
  calendar(
    @Req() request: CustomerSessionRequest,
    @Query() body: CustomerCalendarActivitiesDto,
  ): Promise<CustomerCalendarActivitiesResponse> {
    return this.customerActivities.getCalendarForCustomer(request.customerSession!, {
      endDate: body.endDate,
      includeNoShow: body.includeNoShow ?? false,
      languageId: body.languageId,
      orderBy: body.orderBy,
      orderDirection: body.orderDirection,
      startDate: body.startDate,
    });
  }
}
