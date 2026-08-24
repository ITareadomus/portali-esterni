import { Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { DriverStopStatusResponse, DriverTodayRouteResponse } from "@adam/types";
import { DriverSessionGuard, type DriverSessionRequest } from "../driver-auth/driver-session.guard";
import { DriverTimelineService } from "./driver-timeline.service";
import { DriverFinishStopParamsDto } from "./dto/driver-finish-stop.dto";
import { DriverTimelineDateDto } from "./dto/driver-timeline-date.dto";

@ApiTags("driver-timeline")
@Controller("driver/timeline")
export class DriverTimelineController {
  constructor(
    @Inject(DriverTimelineService)
    private readonly driverTimeline: DriverTimelineService,
  ) {}

  @Get("today")
  @UseGuards(DriverSessionGuard)
  @ApiOkResponse({
    schema: {
      example: {
        date: { ymd: "2026-07-01" },
        driver: {
          id: 737,
          name: "CHRISTOPHER JASON",
          lastname: "SANTOS",
          startTime: "10:00",
          endTime: "20:00",
          available: true,
          selected: true,
          vehicle: {
            id: 2114,
            name: "A10 SCUDO GT408NZ",
            pmsCode: "GT408NZ",
            taskId: 222608,
          },
        },
        stops: [],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid driver session." })
  today(
    @Req() request: DriverSessionRequest,
    @Query() query: DriverTimelineDateDto,
  ): Promise<DriverTodayRouteResponse> {
    return this.driverTimeline.getTodayForDriver(request.driverSession!, {
      date: query.date,
    });
  }

  @Post(":timelineId/start")
  @UseGuards(DriverSessionGuard)
  @ApiOkResponse({
    schema: {
      example: {
        ok: true,
        timelineId: 123,
        taskId: 456,
        isStarted: true,
        isPaused: false,
        isFinished: false,
        realStart: "2026-08-03T09:15:00.000Z",
        realEnd: null,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid driver session." })
  start(
    @Req() request: DriverSessionRequest,
    @Param() params: DriverFinishStopParamsDto,
  ): Promise<DriverStopStatusResponse> {
    return this.driverTimeline.markStopStarted(request.driverSession!, params.timelineId);
  }

  @Post(":timelineId/pause")
  @UseGuards(DriverSessionGuard)
  @ApiOkResponse({
    schema: {
      example: {
        ok: true,
        timelineId: 123,
        taskId: 456,
        isStarted: true,
        isPaused: true,
        isFinished: false,
        realStart: "2026-08-03T09:15:00.000Z",
        realEnd: null,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid driver session." })
  pause(
    @Req() request: DriverSessionRequest,
    @Param() params: DriverFinishStopParamsDto,
  ): Promise<DriverStopStatusResponse> {
    return this.driverTimeline.markStopPaused(request.driverSession!, params.timelineId);
  }

  @Post(":timelineId/finish")
  @UseGuards(DriverSessionGuard)
  @ApiOkResponse({
    schema: {
      example: {
        ok: true,
        timelineId: 123,
        taskId: 456,
        isStarted: true,
        isPaused: false,
        isFinished: true,
        realStart: "2026-08-03T09:15:00.000Z",
        realEnd: "2026-08-03T10:05:00.000Z",
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid driver session." })
  finish(
    @Req() request: DriverSessionRequest,
    @Param() params: DriverFinishStopParamsDto,
  ): Promise<DriverStopStatusResponse> {
    return this.driverTimeline.markStopFinished(request.driverSession!, params.timelineId);
  }

  @Post(":timelineId/reopen")
  @UseGuards(DriverSessionGuard)
  @ApiOkResponse({
    schema: {
      example: {
        ok: true,
        timelineId: 123,
        taskId: 456,
        isStarted: true,
        isPaused: false,
        isFinished: false,
        realStart: "2026-08-03T09:15:00.000Z",
        realEnd: null,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid driver session." })
  reopen(
    @Req() request: DriverSessionRequest,
    @Param() params: DriverFinishStopParamsDto,
  ): Promise<DriverStopStatusResponse> {
    return this.driverTimeline.markStopReopened(request.driverSession!, params.timelineId);
  }
}
