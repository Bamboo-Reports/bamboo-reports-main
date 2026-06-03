import { describe, expect, it } from "vitest"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"

describe("ANALYTICS_EVENTS", () => {
  it("defines auth events", () => {
    expect(ANALYTICS_EVENTS.AUTH_SIGN_IN_SUCCEEDED).toBe("auth_sign_in_succeeded")
    expect(ANALYTICS_EVENTS.AUTH_SIGN_IN_FAILED).toBe("auth_sign_in_failed")
    expect(ANALYTICS_EVENTS.AUTH_SIGN_UP_SUCCEEDED).toBe("auth_sign_up_succeeded")
    expect(ANALYTICS_EVENTS.AUTH_SIGN_UP_FAILED).toBe("auth_sign_up_failed")
    expect(ANALYTICS_EVENTS.AUTH_SIGNED_OUT).toBe("auth_signed_out")
  })

  it("defines session events", () => {
    expect(ANALYTICS_EVENTS.SESSION_STARTED).toBe("session_started")
    expect(ANALYTICS_EVENTS.SESSION_ENDED).toBe("session_ended")
    expect(ANALYTICS_EVENTS.SESSION_HEARTBEAT).toBe("session_heartbeat")
    expect(ANALYTICS_EVENTS.SESSION_IDLE_STARTED).toBe("session_idle_started")
    expect(ANALYTICS_EVENTS.SESSION_RESUMED).toBe("session_resumed")
    expect(ANALYTICS_EVENTS.SCREEN_TIME_SPENT).toBe("screen_time_spent")
  })

  it("defines dashboard events", () => {
    expect(ANALYTICS_EVENTS.DASHBOARD_LOADED).toBe("dashboard_loaded")
    expect(ANALYTICS_EVENTS.DATA_REFRESH_CLICKED).toBe("data_refresh_clicked")
    expect(ANALYTICS_EVENTS.DATA_LOAD_SUCCEEDED).toBe("data_load_succeeded")
    expect(ANALYTICS_EVENTS.DATA_LOAD_FAILED).toBe("data_load_failed")
  })

  it("defines sidebar and section events", () => {
    expect(ANALYTICS_EVENTS.SIDEBAR_TOGGLED).toBe("sidebar_toggled")
    expect(ANALYTICS_EVENTS.SECTION_CHANGED).toBe("section_changed")
    expect(ANALYTICS_EVENTS.SECTION_VIEW_CHANGED).toBe("section_view_changed")
  })

  it("defines map events", () => {
    expect(ANALYTICS_EVENTS.MAP_MODE_CHANGED).toBe("map_mode_changed")
    expect(ANALYTICS_EVENTS.MAP_RECENTER_CLICKED).toBe("map_recenter_clicked")
    expect(ANALYTICS_EVENTS.MAP_MOVED).toBe("map_moved")
    expect(ANALYTICS_EVENTS.MAP_ZOOM_CHANGED).toBe("map_zoom_changed")
    expect(ANALYTICS_EVENTS.MAP_TOOLTIP_VIEWED).toBe("map_tooltip_viewed")
    expect(ANALYTICS_EVENTS.MAP_ERROR_SHOWN).toBe("map_error_shown")
  })

  it("defines filter events", () => {
    expect(ANALYTICS_EVENTS.FILTER_CHANGED).toBe("filter_changed")
    expect(ANALYTICS_EVENTS.FILTER_DROPDOWN_OPENED).toBe("filter_dropdown_opened")
    expect(ANALYTICS_EVENTS.FILTER_SEARCH_TYPED).toBe("filter_search_typed")
    expect(ANALYTICS_EVENTS.FILTER_OPTION_CLICKED).toBe("filter_option_clicked")
    expect(ANALYTICS_EVENTS.FILTER_KEYWORD_CHANGED).toBe("filter_keyword_changed")
    expect(ANALYTICS_EVENTS.FILTERS_RESET).toBe("filters_reset")
  })

  it("defines saved filter events", () => {
    expect(ANALYTICS_EVENTS.SAVED_FILTER_LOADED).toBe("saved_filter_loaded")
    expect(ANALYTICS_EVENTS.SAVED_FILTER_SAVED).toBe("saved_filter_saved")
    expect(ANALYTICS_EVENTS.SAVED_FILTER_DELETED).toBe("saved_filter_deleted")
    expect(ANALYTICS_EVENTS.SAVED_FILTER_RENAMED).toBe("saved_filter_renamed")
    expect(ANALYTICS_EVENTS.SAVED_FILTER_SHARED).toBe("saved_filter_shared")
    expect(ANALYTICS_EVENTS.SAVED_FILTER_UNSHARED).toBe("saved_filter_unshared")
  })

  it("defines export events", () => {
    expect(ANALYTICS_EVENTS.EXPORT_DIALOG_OPENED).toBe("export_dialog_opened")
    expect(ANALYTICS_EVENTS.EXPORT_SELECTION_CHANGED).toBe("export_selection_changed")
    expect(ANALYTICS_EVENTS.EXPORT_SELECT_ALL_CLICKED).toBe("export_select_all_clicked")
    expect(ANALYTICS_EVENTS.EXPORT_CLEAR_CLICKED).toBe("export_clear_clicked")
    expect(ANALYTICS_EVENTS.EXPORT_CANCELLED).toBe("export_cancelled")
    expect(ANALYTICS_EVENTS.EXPORT_STARTED).toBe("export_started")
    expect(ANALYTICS_EVENTS.EXPORT_COMPLETED).toBe("export_completed")
    expect(ANALYTICS_EVENTS.EXPORT_FAILED).toBe("export_failed")
  })

  it("defines search events", () => {
    expect(ANALYTICS_EVENTS.SEARCH_OPENED).toBe("search_opened")
    expect(ANALYTICS_EVENTS.SEARCH_QUERY_TYPED).toBe("search_query_typed")
    expect(ANALYTICS_EVENTS.SEARCH_RESULT_SELECTED).toBe("search_result_selected")
    expect(ANALYTICS_EVENTS.SEARCH_RECENT_ITEM_SELECTED).toBe("search_recent_item_selected")
    expect(ANALYTICS_EVENTS.SEARCH_CLOSED).toBe("search_closed")
  })

  it("defines tour events", () => {
    expect(ANALYTICS_EVENTS.TOUR_STARTED).toBe("tour_started")
    expect(ANALYTICS_EVENTS.TOUR_STEP_VIEWED).toBe("tour_step_viewed")
    expect(ANALYTICS_EVENTS.TOUR_COMPLETED).toBe("tour_completed")
    expect(ANALYTICS_EVENTS.TOUR_SKIPPED).toBe("tour_skipped")
  })

  it("defines favorite events", () => {
    expect(ANALYTICS_EVENTS.FAVORITE_ADDED).toBe("favorite_added")
    expect(ANALYTICS_EVENTS.FAVORITE_REMOVED).toBe("favorite_removed")
    expect(ANALYTICS_EVENTS.FAVORITES_VIEW_OPENED).toBe("favorites_view_opened")
  })

  it("defines error and state events", () => {
    expect(ANALYTICS_EVENTS.EMPTY_STATE_SHOWN).toBe("empty_state_shown")
    expect(ANALYTICS_EVENTS.NO_RESULTS_AFTER_FILTER).toBe("no_results_after_filter")
    expect(ANALYTICS_EVENTS.ERROR_STATE_SHOWN).toBe("error_state_shown")
    expect(ANALYTICS_EVENTS.ERROR_RETRY_CLICKED).toBe("error_retry_clicked")
  })

  it("all event values are unique (no duplicates)", () => {
    const values = Object.values(ANALYTICS_EVENTS)
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })

  it("all event values are non-empty strings", () => {
    for (const [key, value] of Object.entries(ANALYTICS_EVENTS)) {
      expect(typeof value).toBe("string")
      expect(value.length).toBeGreaterThan(0)
    }
  })
})
