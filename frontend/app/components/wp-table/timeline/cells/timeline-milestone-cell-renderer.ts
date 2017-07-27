import * as moment from "moment";
import {$injectNow} from "../../../angular/angular-injector-bridge.functions";
import {WorkPackageResourceInterface} from "../../../api/api-v3/hal-resources/work-package-resource.service";
import {calculatePositionValueForDayCountingPx, RenderInfo, timelineElementCssClass} from "../wp-timeline";
import {TimelineCellRenderer} from "./timeline-cell-renderer";
import Moment = moment.Moment;
import {WorkPackageChangeset} from '../../../wp-edit-form/work-package-changeset';

interface CellMilestoneMovement {
  // Target value to move milestone to
  date?: moment.Moment;
}

export class TimelineMilestoneCellRenderer extends TimelineCellRenderer {
  public get type(): string {
    return 'milestone';
  }

  public isEmpty(wp: WorkPackageResourceInterface) {
    const date = moment(wp.date as any);
    const noDateValue = _.isNaN(date.valueOf());
    return noDateValue;
  }

  public displayPlaceholderUnderCursor(ev: MouseEvent, renderInfo: RenderInfo): HTMLElement {
    const days = Math.floor(ev.offsetX / renderInfo.viewParams.pixelPerDay);

    const placeholder = document.createElement("div");
    placeholder.className = "timeline-element milestone";
    placeholder.style.pointerEvents = "none";
    placeholder.style.height = "1em";
    placeholder.style.width = "1em";
    placeholder.style.left = (days * renderInfo.viewParams.pixelPerDay) + "px";

    const diamond = document.createElement("div");
    diamond.className = "diamond";
    diamond.style.backgroundColor = "#DDDDDD";
    diamond.style.left = "0.5em";
    diamond.style.height = "1em";
    diamond.style.width = "1em";
    placeholder.appendChild(diamond);

    return placeholder;
  }

  /**
   * Assign changed dates to the work package.
   * For generic work packages, assigns start and due date.
   *
   */
  public assignDateValues(changeset:WorkPackageChangeset, dates: CellMilestoneMovement) {
    this.assignDate(changeset, 'date', dates.date!);

    this.updateMilestoneMovedLabel(dates.date!);
  }

  /**
   * Handle movement by <delta> days of milestone.
   */
  public onDaysMoved(wp: WorkPackageResourceInterface,
                     dayUnderCursor: Moment,
                     delta: number,
                     direction: "left" | "right" | "both" | "create" | "dragright") {

    const initialDate = wp.date;
    let dates: CellMilestoneMovement = {};

    if (initialDate) {
      dates.date = moment(initialDate).add(delta, "days");
    }

    return dates;
  }

  public onMouseDown(ev: MouseEvent,
                     dateForCreate: string|null,
                     renderInfo: RenderInfo,
                     elem: HTMLElement): "left" | "right" | "both" | "create" | "dragright" {

    // check for active selection mode
    if (renderInfo.viewParams.activeSelectionMode) {
      renderInfo.viewParams.activeSelectionMode(renderInfo.workPackage);
      ev.preventDefault();
      return "both"; // irrelevant
    }

    let direction: "left" | "right" | "both" | "create" | "dragright" = "both";
    renderInfo.changeset!.startEditing('date');
    this.forceCursor('ew-resize');

    if (dateForCreate) {
      renderInfo.workPackage.date = dateForCreate;
      direction = "create";
      return direction;
    }

    // create date label
    const dateInfo = document.createElement("div");
    dateInfo.className = "rightDateDisplay";
    this.dateDisplaysOnMouseMove.right = dateInfo;
    elem.appendChild(dateInfo);

    this.updateMilestoneMovedLabel(moment(renderInfo.workPackage.date));

    return direction;
  }

  public update(element: HTMLDivElement, renderInfo: RenderInfo): boolean {
    const changeset = renderInfo.changeset || new WorkPackageChangeset(renderInfo.workPackage);

    const viewParams = renderInfo.viewParams;
    const date = moment(changeset.value('dueDate'));

    // abort if no date
    if (!date) {
      return false;
    }

    const diamond = jQuery(".diamond", element)[0];

    element.style.width = 15 + "px";
    element.style.height = 15 + "px";
    diamond.style.width = 15 + "px";
    diamond.style.height = 15 + "px";
    diamond.style.marginLeft = -(15 / 2) + (renderInfo.viewParams.pixelPerDay / 2) + "px";
    diamond.style.backgroundColor = this.typeColor(renderInfo.workPackage);

    // offset left
    const offsetStart = date.diff(viewParams.dateDisplayStart, "days");
    element.style.left = calculatePositionValueForDayCountingPx(viewParams, offsetStart) + "px";

    this.checkForActiveSelectionMode(renderInfo, diamond);

    return true;
  }

  getMarginLeftOfLeftSide(renderInfo: RenderInfo): number {
    const wp = renderInfo.workPackage;
    let start = moment(wp.date as any);
    const offsetStart = start.diff(renderInfo.viewParams.dateDisplayStart, "days");
    return calculatePositionValueForDayCountingPx(renderInfo.viewParams, offsetStart);
  }

  getMarginLeftOfRightSide(ri: RenderInfo): number {
    return this.getMarginLeftOfLeftSide(ri) + ri.viewParams.pixelPerDay;
  }

  getPaddingLeftForIncomingRelationLines(renderInfo: RenderInfo): number {
    return (renderInfo.viewParams.pixelPerDay / 2) - 1;
  }

  getPaddingRightForOutgoingRelationLines(renderInfo: RenderInfo): number {
    return (15 / 2);
  }

  /**
   * Render a milestone element, a single day event with no resize, but
   * move functionality.
   */
  public render(renderInfo: RenderInfo): HTMLDivElement {
    const element = document.createElement("div");
    element.className = timelineElementCssClass + " " + this.type;

    const diamond = document.createElement("div");
    diamond.className = "diamond";
    element.appendChild(diamond);

    return element;
  }

  private updateMilestoneMovedLabel(date: Moment) {
    if (!this.TimezoneService) {
      this.TimezoneService = $injectNow('TimezoneService');
    }
    this.dateDisplaysOnMouseMove.right!.innerText = this.TimezoneService.formattedDate(date);
  }

}
