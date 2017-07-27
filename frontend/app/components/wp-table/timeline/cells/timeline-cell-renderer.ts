import * as moment from "moment";
import {$injectNow} from "../../../angular/angular-injector-bridge.functions";
import {WorkPackageResourceInterface} from "../../../api/api-v3/hal-resources/work-package-resource.service";
import {
  calculatePositionValueForDayCount,
  calculatePositionValueForDayCountingPx,
  RenderInfo,
  timelineElementCssClass,
  timelineMarkerSelectionStartClass
} from "../wp-timeline";
import {classNameLeftHandle, classNameRightHandle} from "./wp-timeline-cell-mouse-handler";
import Moment = moment.Moment;
import {WorkPackageTimelineTableController} from '../container/wp-timeline-container.directive';
import {hasChildrenInTable} from '../../../wp-fast-table/helpers/wp-table-hierarchy-helpers';
import {WorkPackageChangeset} from '../../../wp-edit-form/work-package-changeset';

interface CellDateMovement {
  // Target values to move work package to
  startDate?:moment.Moment;
  dueDate?:moment.Moment;
}

export class TimelineCellRenderer {

  protected TimezoneService:any;

  protected dateDisplaysOnMouseMove:{ left?:HTMLElement; right?:HTMLElement } = {};

  constructor(public workPackageTimeline:WorkPackageTimelineTableController) {
  }

  public get type():string {
    return "bar";
  }

  public get fallbackColor():string {
    return "rgba(50, 50, 50, 0.1)";
  }

  public isEmpty(wp:WorkPackageResourceInterface) {
    const start = moment(wp.startDate as any);
    const due = moment(wp.dueDate as any);
    const noStartAndDueValues = _.isNaN(start.valueOf()) && _.isNaN(due.valueOf());
    return noStartAndDueValues;
  }

  public displayPlaceholderUnderCursor(ev:MouseEvent, renderInfo:RenderInfo):HTMLElement {
    const days = Math.floor(ev.offsetX / renderInfo.viewParams.pixelPerDay);

    const placeholder = document.createElement("div");
    placeholder.style.pointerEvents = "none";
    placeholder.style.backgroundColor = "#DDDDDD";
    placeholder.style.position = "absolute";
    placeholder.style.height = "1em";
    placeholder.style.width = "30px";
    placeholder.style.left = (days * renderInfo.viewParams.pixelPerDay) + "px";

    return placeholder;
  }

  /**
   * Assign changed dates to the work package.
   * For generic work packages, assigns start and due date.
   *
   */
  public assignDateValues(changeset:WorkPackageChangeset, dates:CellDateMovement) {
    this.assignDate(changeset, "startDate", dates.startDate!);
    this.assignDate(changeset, "dueDate", dates.dueDate!);

    this.updateLeftRightMovedLabel(dates.startDate!, dates.dueDate!);
  }

  /**
   * Handle movement by <delta> days of the work package to either (or both) edge(s)
   * depending on which initial date was set.
   */
  public onDaysMoved(wp:WorkPackageResourceInterface,
                     dayUnderCursor:Moment,
                     delta:number,
                     direction:"left" | "right" | "both" | "create" | "dragright"):CellDateMovement {

    const initialStartDate = wp.startDate;
    const initialDueDate = wp.dueDate;

    let dates:CellDateMovement = {};

    if (direction === "left") {
      dates.startDate = moment(initialStartDate || initialDueDate).add(delta, "days");
    } else if (direction === "right") {
      dates.dueDate = moment(initialDueDate || initialStartDate).add(delta, "days");
    } else if (direction === "both") {
      if (initialStartDate) {
        dates.startDate = moment(initialStartDate).add(delta, "days");
      }
      if (initialDueDate) {
        dates.dueDate = moment(initialDueDate).add(delta, "days");
      }
    } else if (direction === "dragright") {
      dates.dueDate = moment(wp.startDate).clone().add(delta, "days");
    }

    // avoid negative "overdrag" if only start or due are changed
    if (direction !== "both") {
      if (dates.startDate != undefined && dates.startDate.isAfter(moment(wp.dueDate))) {
        dates.startDate = moment(wp.dueDate);
      } else if (dates.dueDate != undefined && dates.dueDate.isBefore(moment(wp.startDate))) {
        dates.dueDate = moment(wp.startDate);
      }
    }

    return dates;
  }

  public onMouseDown(ev:MouseEvent,
                     dateForCreate:string | null,
                     renderInfo:RenderInfo,
                     elem:HTMLElement):"left" | "right" | "both" | "dragright" | "create" {

    // check for active selection mode
    if (renderInfo.viewParams.activeSelectionMode) {
      renderInfo.viewParams.activeSelectionMode(renderInfo.workPackage);
      ev.preventDefault();
      return "both"; // irrelevant
    }

    renderInfo.changeset!.startEditing("startDate");
    renderInfo.changeset!.startEditing("dueDate");
    let direction:"left" | "right" | "both" | "create" | "dragright";

    // Update the cursor and maybe set start/due values
    if (jQuery(ev.target).hasClass(classNameLeftHandle)) {
      // only left
      direction = "left";
      this.forceCursor("w-resize");
      if (renderInfo.workPackage.startDate === null) {
        renderInfo.workPackage.startDate = renderInfo.workPackage.dueDate;
      }
    } else if (jQuery(ev.target).hasClass(classNameRightHandle) || dateForCreate) {
      // only right
      direction = "right";
      this.forceCursor("e-resize");
      if (renderInfo.workPackage.dueDate === null) {
        renderInfo.workPackage.dueDate = renderInfo.workPackage.startDate;
      }
    } else {
      // both
      direction = "both";
      this.forceCursor("ew-resize");
    }

    this.dateDisplaysOnMouseMove = [null, null];

    if (dateForCreate) {
      renderInfo.workPackage.startDate = dateForCreate;
      renderInfo.workPackage.dueDate = dateForCreate;
      direction = "dragright";
    }

    if (!jQuery(ev.target).hasClass(classNameRightHandle) && renderInfo.workPackage.startDate) {
      // create left date label
      const leftInfo = document.createElement("div");
      leftInfo.className = "leftDateDisplay";
      this.dateDisplaysOnMouseMove.left = leftInfo;
      elem.appendChild(leftInfo);
    }
    if (!jQuery(ev.target).hasClass(classNameLeftHandle) && renderInfo.workPackage.dueDate) {
      // create right date label
      const rightInfo = document.createElement("div");
      rightInfo.className = "rightDateDisplay";
      this.dateDisplaysOnMouseMove.right = rightInfo;
      elem.appendChild(rightInfo);
    }

    this.updateLeftRightMovedLabel(
      moment(renderInfo.workPackage.startDate),
      moment(renderInfo.workPackage.dueDate));

    return direction;
  }

  public onMouseDownEnd() {
    this.dateDisplaysOnMouseMove.left && this.dateDisplaysOnMouseMove.left.remove();
    this.dateDisplaysOnMouseMove.right && this.dateDisplaysOnMouseMove.right.remove();
    this.dateDisplaysOnMouseMove = {};
  }

  /**
   * @return true, if the element should still be displayed.
   *         false, if the element must be removed from the timeline.
   */
  public update(bar:HTMLDivElement, renderInfo:RenderInfo):boolean {
    const changeset = renderInfo.changeset || new WorkPackageChangeset(renderInfo.workPackage);

    // general settings - bar
    bar.style.backgroundColor = this.typeColor(renderInfo.workPackage);

    const viewParams = renderInfo.viewParams;
    let start = moment(changeset.value('startDate'));
    let due = moment(changeset.value('dueDate'));

    if (_.isNaN(start.valueOf()) && _.isNaN(due.valueOf())) {
      bar.style.visibility = "hidden";
    } else {
      bar.style.visibility = "visible";
    }

    // only start date, fade out bar to the right
    if (_.isNaN(due.valueOf()) && !_.isNaN(start.valueOf())) {
      due = start.clone();
      bar.style.backgroundColor = "inherit";
      const color = this.typeColor(renderInfo.workPackage);
      bar.style.backgroundImage = `linear-gradient(90deg, ${color} 0%, rgba(255,255,255,0) 80%)`;
    }

    // only due date, fade out bar to the left
    if (_.isNaN(start.valueOf()) && !_.isNaN(due.valueOf())) {
      start = due.clone();
      bar.style.backgroundColor = "inherit";
      const color = this.typeColor(renderInfo.workPackage);
      bar.style.backgroundImage = `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${color} 100%)`;
    }

    // offset left
    const offsetStart = start.diff(viewParams.dateDisplayStart, "days");
    bar.style.left = calculatePositionValueForDayCount(viewParams, offsetStart);

    // duration
    const duration = due.diff(start, "days") + 1;
    bar.style.width = calculatePositionValueForDayCount(viewParams, duration);

    // ensure minimum width
    if (!_.isNaN(start.valueOf()) || !_.isNaN(due.valueOf())) {
      const minWidth = _.max([renderInfo.viewParams.pixelPerDay, 2]);
      bar.style.minWidth = minWidth + "px";
    }

    this.checkForActiveSelectionMode(renderInfo, bar);
    this.checkForSpecialDisplaySituations(renderInfo, bar);

    return true;
  }

  protected checkForActiveSelectionMode(renderInfo:RenderInfo, element:HTMLElement) {
    if (renderInfo.viewParams.activeSelectionMode) {
      element.style.backgroundImage = null; // required! unable to disable "fade out bar" with css

      if (renderInfo.viewParams.selectionModeStart === "" + renderInfo.workPackage.id) {
        jQuery(element).addClass(timelineMarkerSelectionStartClass);
        element.style.background = null;
      }
    }
  }

  getMarginLeftOfLeftSide(renderInfo:RenderInfo):number {
    const wp = renderInfo.workPackage;

    let start = moment(wp.startDate as any);
    start = _.isNaN(start.valueOf()) ? moment(wp.dueDate).clone() : start;

    const offsetStart = start.diff(renderInfo.viewParams.dateDisplayStart, "days");

    return calculatePositionValueForDayCountingPx(renderInfo.viewParams, offsetStart);
  }

  getMarginLeftOfRightSide(renderInfo:RenderInfo):number {
    const wp = renderInfo.workPackage;

    let start = moment(wp.startDate as any);
    start = _.isNaN(start.valueOf()) ? moment(wp.dueDate).clone() : start;

    let due = moment(wp.dueDate as any);
    due = _.isNaN(due.valueOf()) ? start.clone() : due;

    const offsetStart = start.diff(renderInfo.viewParams.dateDisplayStart, "days");
    const duration = due.diff(start, "days") + 1;

    return calculatePositionValueForDayCountingPx(renderInfo.viewParams, offsetStart + duration);
  }

  getPaddingLeftForIncomingRelationLines(renderInfo:RenderInfo):number {
    return renderInfo.viewParams.pixelPerDay / 8;
  }

  getPaddingRightForOutgoingRelationLines(renderInfo:RenderInfo):number {
    return 0;
  }

  /**
   * Render the generic cell element, a bar spanning from
   * start to due date.
   */
  public render(renderInfo:RenderInfo):HTMLDivElement {
    const bar = document.createElement("div");
    const left = document.createElement("div");
    const right = document.createElement("div");

    bar.className = timelineElementCssClass + " " + this.type;
    left.className = classNameLeftHandle;
    right.className = classNameRightHandle;

    bar.appendChild(left);
    bar.appendChild(right);

    return bar;
  }

  protected typeColor(wp:WorkPackageResourceInterface):string {
    let type = wp.type && wp.type.state.value;
    if (type && type.color) {
      return type.color;
    }

    return this.fallbackColor;
  }

  protected assignDate(changeset:WorkPackageChangeset, attributeName:string, value:moment.Moment) {
    if (value) {
      changeset.setValue(attributeName, value.format("YYYY-MM-DD"));
    }
  }

  /**
   * Force the cursor to the given cursor type.
   */
  protected forceCursor(cursor:string) {
    jQuery(".hascontextmenu").css("cursor", cursor);
    jQuery("." + timelineElementCssClass).css("cursor", cursor);
  }

  /**
   * Changes the presentation of the work package.
   *
   * Known cases:
   * 1. Display a clamp if this work package is a parent element
   */
  checkForSpecialDisplaySituations(renderInfo:RenderInfo, bar:HTMLElement) {
    const wp = renderInfo.workPackage;

    // Cannot eddit the work package if it has children
    if (!wp.isLeaf) {
      bar.classList.add("-readonly");
    }

    // Display the parent as clamp-style when it has children in the table
    if (this.workPackageTimeline.inHierarchyMode &&
      hasChildrenInTable(wp, this.workPackageTimeline.workPackageTable)) {
      bar.classList.add('-clamp-style');
      bar.style.borderStyle = 'solid';
      bar.style.borderWidth = '2px';
      bar.style.borderColor = this.typeColor(wp);
      bar.style.borderBottom = 'none';
      bar.style.background = 'none';
    }
  }

  private updateLeftRightMovedLabel(start:Moment, due:Moment) {
    if (!this.TimezoneService) {
      this.TimezoneService = $injectNow("TimezoneService");
    }

    if (this.dateDisplaysOnMouseMove.left && start) {
      this.dateDisplaysOnMouseMove.left.innerText = this.TimezoneService.formattedDate(start);
    }

    if (this.dateDisplaysOnMouseMove.right && due) {
      this.dateDisplaysOnMouseMove.right.innerText = this.TimezoneService.formattedDate(due);
    }
  }
}
