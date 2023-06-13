import type {PanEvent, TapEvent, KeyEvent, UIEvent, MoveEvent} from "core/ui_events"
import {Dimensions} from "core/enums"
import type * as p from "core/properties"
import type {Quad} from "../../glyphs/quad"
import type {Rect} from "../../glyphs/rect"
import type {GlyphRenderer} from "../../renderers/glyph_renderer"
import type {ColumnDataSource} from "../../sources/column_data_source"
import {EditTool, EditToolView} from "./edit_tool"
import {tool_icon_box_edit} from "styles/icons.css"

export interface HasRectOrQuadCDS {
  glyph: Rect | Quad
  data_source: ColumnDataSource
}

export class BoxEditToolView extends EditToolView {
  declare model: BoxEditTool
  _draw_basepoint: [number, number] | null

  override _tap(ev: TapEvent): void {
    if ((this._draw_basepoint != null) || (this._basepoint != null))
      return
    this._select_event(ev, this._select_mode(ev), this.model.renderers)
  }

  override _keyup(ev: KeyEvent): void {
    if (!this.model.active || !this._mouse_in_frame)
      return
    for (const renderer of this.model.renderers) {
      if (ev.key == "Backspace") {
        this._delete_selected(renderer)
      } else if (ev.key == "Escape") {
        // Type properly once selection_manager is typed
        const cds = renderer.data_source
        cds.selection_manager.clear()
      }
    }
  }

  _set_extent([sx0, sx1]: [number, number], [sy0, sy1]: [number, number],
              append: boolean, emit: boolean = false): void {
    const renderer = this.model.renderers[0]
    const renderer_view = this.plot_view.renderer_view(renderer)
    if (renderer_view == null)
      return
    // Type once dataspecs are typed
    const glyph: any = renderer.glyph
    const cds = renderer.data_source
    const [x0, x1] = renderer_view.coordinates.x_scale.r_invert(sx0, sx1)
    const [y0, y1] = renderer_view.coordinates.y_scale.r_invert(sy0, sy1)

    if ("x" in glyph) // glyph is Rect
      this._set_rect_extend(glyph, append, cds, x0, y0, x1, y1)
    else if ("left" in glyph) // glyph is Quad
      this._set_quad_extend(glyph, append, cds, x0, y0, x1, y1)
    this._emit_cds_changes(cds, true, false, emit)
  }

  private _set_rect_extend(glyph: any, append: boolean, cds: ColumnDataSource, x0: number, y0: number, x1: number, y1: number) {
    const [x, y] = [(x0+x1)/2, (y0+y1)/2]
    const [w, h] = [x1-x0, y1-y0]
    const [xkey, ykey] = [glyph.x.field, glyph.y.field]
    const [wkey, hkey] = [glyph.width.field, glyph.height.field]
    if (append) {
      this._pop_glyphs(cds, this.model.num_objects)
      if (xkey) cds.get_array(xkey).push(x)
      if (ykey) cds.get_array(ykey).push(y)
      if (wkey) cds.get_array(wkey).push(w)
      if (hkey) cds.get_array(hkey).push(h)
      this._pad_empty_columns(cds, [xkey, ykey, wkey, hkey])
    } else {
      const index = cds.data[xkey].length - 1
      if (xkey) cds.data[xkey][index] = x
      if (ykey) cds.data[ykey][index] = y
      if (wkey) cds.data[wkey][index] = w
      if (hkey) cds.data[hkey][index] = h
    }
  }

  private _set_quad_extend(glyph: any, append: boolean, cds: ColumnDataSource, x0: number, y0: number, x1: number, y1: number) {
    const [left, bottom, right, top] = [glyph.left.field, glyph.bottom.field, glyph.right.field, glyph.top.field]
    if (append) {
      this._pop_glyphs(cds, this.model.num_objects)
      if (left) cds.get_array(left).push(x0)
      if (bottom) cds.get_array(bottom).push(y0)
      if (right) cds.get_array(right).push(x1)
      if (top) cds.get_array(top).push(y0)
      this._pad_empty_columns(cds, [left, bottom, right, top])
    } else {
      const index = cds.data[left].length - 1
      if (left) cds.data[left][index] = x0
      if (bottom) cds.data[bottom][index] = y0
      if (right) cds.data[right][index] = x1
      if (top) cds.data[top][index] = y1
    }
  }

  _drag_all_points(ev: UIEvent, renderers: (GlyphRenderer & HasRectOrQuadCDS)[], dim: Dimensions = "both"): void {
    if (this._basepoint == null)
      return

    const [bx, by] = this._basepoint
    for (const renderer of renderers) {
      const basepoint = this._map_drag(bx, by, renderer)
      const point = this._map_drag(ev.sx, ev.sy, renderer)
      if (point == null || basepoint == null) {
        continue
      }
      const [x, y] = point
      const [px, py] = basepoint
      const [dx, dy] = [x-px, y-py]
      // Type once dataspecs are typed
      const glyph: any = renderer.glyph
      const cds = renderer.data_source
      if ("x" in glyph)  // Rect
        this._drag_rect_point(glyph, cds, dim, dx, dy)
      else if ("left" in glyph)  // Quad
        this._drag_quad_point(glyph, cds, dim, dx, dy)

      cds.change.emit()
    }
    this._basepoint = [ev.sx, ev.sy]
  }

  private _drag_rect_point(glyph: any, cds: ColumnDataSource, dim: Dimensions, dx: number, dy: number) {
    const [xkey, ykey] = [glyph.x.field, glyph.y.field]
    for (const index of cds.selected.indices) {
      if (xkey && (dim == "width" || dim == "both")) {
        cds.data[xkey][index] += dx
      }
      if (ykey && (dim == "height" || dim == "both")) {
        cds.data[ykey][index] += dy
      }
    }
  }

  private _drag_quad_point(glyph: any, cds: ColumnDataSource, dim: Dimensions, dx: number, dy: number) {
    const [left, bottom, right, top] = [glyph.left.field, glyph.bottom.field, glyph.right.field, glyph.top.field]

    for (const index of cds.selected.indices) {
      if ((left || right) && (dim == "width" || dim == "both")) {
        cds.data[left][index] += dx
        cds.data[right][index] += dx
      }
      if ((top || bottom) && (dim == "height" || dim == "both")) {
        cds.data[top][index] += dy
        cds.data[bottom][index] += dy
      }
    }
  }

  _update_box(ev: UIEvent, append: boolean = false, emit: boolean = false): void {
    if (this._draw_basepoint == null)
      return
    const curpoint: [number, number] = [ev.sx, ev.sy]
    const frame = this.plot_view.frame
    const dims = this.model.dimensions
    const [sxlim, sylim] = this.model._get_dim_limits(this._draw_basepoint, curpoint, frame, dims)
    this._set_extent(sxlim, sylim, append, emit)
  }

  override _doubletap(ev: TapEvent): void {
    if (!this.model.active)
      return
    if (this._draw_basepoint != null) {
      this._update_box(ev, false, true)
      this._draw_basepoint = null
    } else {
      this._draw_basepoint = [ev.sx, ev.sy]
      this._select_event(ev, "append", this.model.renderers)
      this._update_box(ev, true, false)
    }
  }

  override _move(ev: MoveEvent): void {
    this._update_box(ev, false, false)
  }

  override _pan_start(ev: PanEvent): void {
    if (ev.modifiers.shift) {
      if (this._draw_basepoint != null)
        return
      this._draw_basepoint = [ev.sx, ev.sy]
      this._update_box(ev, true, false)
    } else {
      if (this._basepoint != null)
        return
      this._select_event(ev, "append", this.model.renderers)
      this._basepoint = [ev.sx, ev.sy]
    }
  }

  override _pan(ev: PanEvent, append: boolean = false, emit: boolean = false): void {
    if (ev.modifiers.shift) {
      if (this._draw_basepoint == null)
        return
      this._update_box(ev, append, emit)
    } else {
      if (this._basepoint == null)
        return
      this._drag_all_points(ev, this.model.renderers)
    }
  }

  override _pan_end(ev: PanEvent): void {
    this._pan(ev, false, true)
    if (ev.modifiers.shift) {
      this._draw_basepoint = null
    } else {
      this._basepoint = null
      for (const renderer of this.model.renderers)
        this._emit_cds_changes(renderer.data_source, false, true, true)
    }
  }
}

export namespace BoxEditTool {
  export type Attrs = p.AttrsOf<Props>

  export type Props = EditTool.Props & {
    dimensions: p.Property<Dimensions>
    num_objects: p.Property<number>
    renderers: p.Property<(GlyphRenderer & HasRectOrQuadCDS)[]>
  }
}

export interface BoxEditTool extends BoxEditTool.Attrs {}

export class BoxEditTool extends EditTool {
  declare properties: BoxEditTool.Props
  declare __view_type__: BoxEditToolView

  override renderers: (GlyphRenderer & HasRectOrQuadCDS)[]

  constructor(attrs?: Partial<BoxEditTool.Attrs>) {
    super(attrs)
  }

  static {
    this.prototype.default_view = BoxEditToolView

    this.define<BoxEditTool.Props>(({Int}) => ({
      dimensions:  [ Dimensions, "both" ],
      num_objects: [ Int, 0 ],
    }))
  }

  override tool_name = "Box Edit Tool"
  override tool_icon = tool_icon_box_edit
  override event_type = ["tap" as "tap", "pan" as "pan", "move" as "move"]
  override default_order = 1
}
