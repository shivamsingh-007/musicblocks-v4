import type {
    Bounds,
    BrickMinimums,
    BrickOutlineInput,
    BrickOutlineOutput,
} from '@masonry/@types/brick';

// ────────────────────────── Constants ────────────────────────────────────────────────────────────

// ── Head padding ──
/** Distance from the top edge of the head to its inner content */
export const HEAD_PAD_Y1 = 4;
/** Distance from the bottom edge of the head to its inner content */
export const HEAD_PAD_Y2 = 4;
/** Distance from the left edge of the head to its inner content */
export const HEAD_PAD_X1 = 7;
/** Distance from the right edge of the head to its inner content */
export const HEAD_PAD_X2 = 7;

// ── Gutters ──
/** Horizontal gap between the main label and the parameter labels */
export const LABEL_PARAM_GUTTER_X = 10;
/** Vertical gap between stacked parameter labels */
export const PARAM_GUTTER_Y = 8;

// ── Tail ──
/** Horizontal width of the tail's indent that forms the nesting cavity notch */
export const TAIL_INDENT_W = 6;
/** Total width of the closing step at the bottom of the tail */
export const TAIL_STEP_W = 30;
/** Height of the closing step at the bottom of the tail */
export const TAIL_STEP_H = 6;

// ── Notch geometry ──
// V-notches (top/bottom/nested horizontal edges): U-shaped groove or tab.
// H-notches (left/right vertical edges): semicircular groove or tab.
// Convex (tab) uses the radius constant directly.
// Concave (groove) = tab radius + strokeWidth, accounting for SVG stroke bleed on each side.
// Lip arc radii are derived from strokeWidth at each call site.

/** Tab radius for V-notches (top/bottom/nested edges). Groove radius = V_NOTCH_RADIUS + strokeWidth. */
export const V_NOTCH_RADIUS = 3;
/** x-offset from the left edge (or TAIL_INDENT_W for nested notches) to a V-notch centre. */
export const NOTCH_OFFSET_X = 12;

/** Tab radius for H-notches (left/right side edges). Groove radius = H_NOTCH_RADIUS + strokeWidth. */
export const H_NOTCH_RADIUS = 3;
/** y-offset from the top of an arg slot down to an H-notch centre. */
export const NOTCH_OFFSET_Y = 9;

// ────────────────────────────────────────────────────────────────────────────────────────────────

interface NormalizedInput extends Omit<
    BrickOutlineInput,
    'hasTopNotch' | 'hasBottomNotch' | 'hasLeftNotch'
> {
    hasNesting: boolean;
    hasTopNotch: boolean;
    hasBottomNotch: boolean;
    hasLeftNotch: boolean;
}

interface ComputedDimensions {
    /** Total outer width of the brick */
    width: number;
    /** Total outer height of the brick (headHeight + tailHeight) */
    height: number;
    /** Height of the top head section containing labels and args */
    headHeight: number;
    /** Height of the nesting cavity between the head and the tail step; 0 when no nesting */
    nestHeight: number;
}

export class BrickOutlineGenerator {
    private dims: ComputedDimensions = { width: 0, height: 0, headHeight: 0, nestHeight: 0 };
    private input: NormalizedInput = {
        strokeWidth: 0,
        labelDims: { w: 0, h: 0 },
        paramArgDims: [],
        hasNesting: false,
        hasTopNotch: false,
        hasBottomNotch: false,
        hasLeftNotch: false,
    };

    /**
     * Creates a reusable brick outline generator bound to the given size minimums.
     *
     * Minimums are fixed at creation time so the generator can be memoized and
     * called cheaply on every render.
     *
     * @param minimums - SVG-unit floor dimensions for width, heights, and slots.
     */
    constructor(private minimums: BrickMinimums) {}

    // ────────────────────────── Dimension Calculation ────────────────────────────────────────────────

    computeDimensions(input: BrickOutlineInput): ComputedDimensions {
        const { minWidth, minLabelHeight, minNestHeight, minParamHeight, minArgHeight } =
            this.minimums;
        const params = input.paramArgDims.map((p) => p.param ?? { w: 0, h: minParamHeight });
        const args = input.paramArgDims.map((p) => p.arg ?? { w: 0, h: minArgHeight });

        // SVG strokes straddle the path line — s/2 bleeds outside on each side;
        // every segment includes s/2 at both ends so the stroke isn't clipped.
        const strokeWidth = input.strokeWidth;

        // ── Width ──

        // ── Head ──
        const maxParamWidth = params.length > 0 ? Math.max(...params.map((p) => p.w)) : 0;
        const labelParamGutter = maxParamWidth > 0 ? LABEL_PARAM_GUTTER_X : 0;
        const headWidth =
            strokeWidth / 2 +
            HEAD_PAD_X1 +
            input.labelDims.w +
            labelParamGutter +
            maxParamWidth +
            HEAD_PAD_X2 +
            strokeWidth / 2;

        // ── Tail ──
        const tailIndentWidth =
            strokeWidth / 2 + TAIL_INDENT_W + (input.nestingDims?.w ?? 0) + strokeWidth / 2;
        const tailStepWidth = strokeWidth / 2 + TAIL_STEP_W + strokeWidth / 2;

        const tailWidth = Math.max(tailIndentWidth, tailStepWidth);

        const width = Math.max(headWidth, tailWidth, minWidth);

        // ── Height ──

        // ── Head ──
        const paramsTotalHeight = params.reduce((sum, p) => sum + p.h, 0);
        const paramGutterTotal = PARAM_GUTTER_Y * Math.max(0, params.length - 1);

        const headHeightByLabel =
            strokeWidth / 2 +
            HEAD_PAD_Y1 +
            Math.max(input.labelDims.h, minLabelHeight) +
            HEAD_PAD_Y2 +
            strokeWidth / 2;
        const headHeightByParams =
            strokeWidth / 2 +
            HEAD_PAD_Y1 +
            paramsTotalHeight +
            paramGutterTotal +
            HEAD_PAD_Y2 +
            strokeWidth / 2;
        // No stroke clearance or padding — args are slots for external components whose
        // input dims already account for their own strokes, if present.
        const headHeightByArgs = args.reduce((sum, a) => sum + a.h, 0);

        const headHeight = Math.max(headHeightByLabel, headHeightByParams, headHeightByArgs);

        // ── Tail ──
        const hasNesting = input.nestingDims !== undefined;
        const nestHeight = hasNesting ? Math.max(input.nestingDims?.h ?? 0, minNestHeight) : 0;
        const tailHeight = hasNesting
            ? nestHeight + strokeWidth / 2 + TAIL_STEP_H + strokeWidth / 2
            : 0;

        const height = headHeight + tailHeight;

        this.dims = { width, height, headHeight, nestHeight };

        return { width, height, headHeight, nestHeight };
    }

    /**
     * Returns the y-coordinate of each right-edge notch centre, one per argument slot.
     * Each centre sits NOTCH_OFFSET_Y below the top of its row, regardless of row height.
     */
    private computeArgNotchCentreYs(): number[] {
        const minArgHeight = this.minimums.minArgHeight;
        const centreYs: number[] = [];
        let slotTop = 0;
        for (const { arg } of this.input.paramArgDims) {
            const rowH = Math.max(arg?.h ?? 0, minArgHeight);
            if (arg !== null) {
                centreYs.push(slotTop + NOTCH_OFFSET_Y);
            }
            slotTop += rowH;
        }
        return centreYs;
    }

    // ────────────────────────── Arc Helpers ──────────────────────────────────────────────────────────

    /** Inward U-shape groove arc (left → right). Used by top notch and nested bottom notch. */
    private buildVGroove(): string[] {
        const strokeWidth = this.input.strokeWidth;
        const grooveR = V_NOTCH_RADIUS + strokeWidth;
        const lip = strokeWidth / 2;
        const R = grooveR - lip;
        return [
            // Quarter-arc: horizontal (left) → vertical (down). CW
            `a ${lip} ${lip} 0 0 1 ${lip} ${lip}`,
            // Semicircle: vertical (down) → vertical (up). CCW (U-shape)
            `a ${R} ${R} 0 0 0 ${2 * R} 0`,
            // Quarter-arc: vertical (up) → horizontal (right). CW
            `a ${lip} ${lip} 0 0 1 ${lip} ${-lip}`,
        ];
    }

    /** Outward U-shape tab arc (right → left). Used by bottom notch and nested top notch. */
    private buildVTab(): string[] {
        const strokeWidth = this.input.strokeWidth;
        const tabR = V_NOTCH_RADIUS;
        const lip = strokeWidth / 2;
        const R = tabR - lip;
        return [
            // Quarter-arc: horizontal (right) → vertical (down). CCW
            `a ${lip} ${lip} 0 0 0 ${-lip} ${lip}`,
            // Semicircle: vertical (down) → vertical (up). CW (U-shape)
            `a ${R} ${R} 0 0 1 ${-2 * R} 0`,
            // Quarter-arc: vertical (up) → horizontal (left). CCW
            `a ${lip} ${lip} 0 0 0 ${-lip} ${-lip}`,
        ];
    }

    // ────────────────────────── Path Segments ────────────────────────────────────────────────────────

    /**
     * Top edge of the brick, left → right.
     * Draws a full-size arc groove (hasTopNotch) for interlocking with bricks above.
     * The groove cuts INWARD into the brick body.
     *
     * @param strokeWidth - Stroke width in SVG units
     * @param width       - Total outer width of the brick
     * @param hasTopNotch - Whether to draw the top notch groove
     */
    private segTopEdge(): string[] {
        const strokeWidth = this.input.strokeWidth;
        const width = this.dims.width;
        // No notch — single flat span, inset by strokeWidth/2 at each end.
        if (!this.input.hasTopNotch) {
            return [`M ${strokeWidth / 2} ${strokeWidth / 2}`, `h ${width - strokeWidth}`];
        }

        // flatBefore: horizontal run from the starting M position to the notch left edge
        // flatAfter:  horizontal run from the notch right edge to the brick's right edge
        const grooveR = V_NOTCH_RADIUS + strokeWidth;
        const flatBefore = NOTCH_OFFSET_X - grooveR - strokeWidth / 2;
        const flatAfter = width - NOTCH_OFFSET_X - grooveR - strokeWidth / 2;

        return [
            `M ${strokeWidth / 2} ${strokeWidth / 2}`,
            `h ${flatBefore}`, // flat run to groove left edge
            ...this.buildVGroove(),
            `h ${flatAfter}`, // flat run to brick right edge
        ];
    }

    /**
     * Right edge of the head, top → bottom.
     * Draws one full-size concave groove per entry in `notchCentres`, cutting INWARD into the brick (−x).
     * Each groove receives one argument brick plugged in from the right.
     *
     * @param strokeWidth  - Stroke width in SVG units
     * @param headHeight   - Height of the head section
     * @param notchCentres - Absolute y positions (top → bottom) of each groove centre
     */
    private segHeadRight(notchCentres: number[]): string[] {
        const strokeWidth = this.input.strokeWidth;
        // The edge runs between the two corners, each inset by strokeWidth/2 so the stroke isn't clipped.
        const edgeStart = strokeWidth / 2; // top-right corner (pen arrives here)
        const edgeEnd = this.dims.headHeight - strokeWidth / 2; // bottom-right corner

        // No notches — single straight run.
        if (notchCentres.length === 0) {
            return [`v ${edgeEnd - edgeStart}`];
        }

        const grooveR = H_NOTCH_RADIUS + strokeWidth;
        const lip = (3 * strokeWidth) / 2; // small flare arc radius, proportional to the stroke

        const segs: string[] = [];
        let pen = edgeStart; // current y of the pen, travelling downwards

        for (const centre of notchCentres) {
            // Build the notch span from its centre, one portion above and below:
            //   centre        — the notch centre
            //   semicircleTop — one radius above the centre
            //   notchTop      — one lip arc above the semicircle (where the groove begins)
            const semicircleTop = centre - grooveR;
            const notchTop = semicircleTop - lip;
            // ...and symmetrically downwards (where the groove ends):
            const semicircleBottom = centre + grooveR;
            const notchBottom = semicircleBottom + lip;

            // Skip a notch that would overlap the previous one or run past the bottom corner,
            // so the path stays continuous instead of self-crossing.
            if (notchTop < pen || notchBottom > edgeEnd) {
                continue;
            }

            // 1. flat run down to where the groove begins
            const flatBefore = notchTop - pen;
            segs.push(`v ${flatBefore}`);
            // 2. lip arc: peel the edge inwards (−x)
            segs.push(`a ${lip} ${lip} 0 0 1 ${-lip} ${lip}`);
            // 3. semicircle: the concave groove dipping into the brick (−x)
            segs.push(`a ${grooveR} ${grooveR} 0 0 0 0 ${2 * grooveR}`);
            // 4. lip arc: bring the edge back out
            segs.push(`a ${lip} ${lip} 0 0 1 ${lip} ${lip}`);

            pen = notchBottom;
        }

        // 5. remaining flat run down to the bottom corner
        segs.push(`v ${edgeEnd - pen}`);
        return segs;
    }

    /**
     * Bottom edge of the head (used for bricks without nesting), right → left.
     * Draws a smaller arc tab (hasBottomNotch) protruding OUTWARD below the brick.
     * Width is reduced by 2*s so it fits snugly inside the top groove when bricks stack.
     *
     * @param strokeWidth    - Stroke width in SVG units
     * @param width          - Total outer width of the brick
     * @param hasBottomNotch - Whether to draw the bottom notch tab
     */
    private segHeadBottom(): string[] {
        const strokeWidth = this.input.strokeWidth;
        const width = this.dims.width;
        // No notch — single flat span going left.
        if (!this.input.hasBottomNotch) {
            return [`h ${-(width - strokeWidth)}`];
        }

        if (strokeWidth >= 2 * V_NOTCH_RADIUS) {
            return [`h ${-(width - strokeWidth)}`];
        }

        const flatBefore = width - NOTCH_OFFSET_X - V_NOTCH_RADIUS - strokeWidth / 2;
        const flatAfter = NOTCH_OFFSET_X - V_NOTCH_RADIUS - strokeWidth / 2;

        return [
            `h ${-flatBefore}`, // flat run to tab right edge
            ...this.buildVTab(),
            `h ${-flatAfter}`, // flat run to brick left edge
        ];
    }

    /**
     * Left edge of the brick, bottom → top.
     * Draws a single smaller convex tab (hasLeftNotch) protruding OUTWARD from the brick (−x).
     * Tab radius is H_NOTCH_RADIUS; the parent's right groove uses H_NOTCH_RADIUS + strokeWidth.
     *
     * @param strokeWidth   - Stroke width in SVG units
     * @param height        - Total outer height of the brick
     * @param hasLeftNotch  - Whether to draw the left tab
     */
    private segLeftEdge(): string[] {
        const strokeWidth = this.input.strokeWidth;
        // The edge runs between the two corners, each inset by strokeWidth/2; travelled upward.
        const edgeStart = this.dims.height - strokeWidth / 2; // bottom-left corner (pen arrives here)
        const edgeEnd = strokeWidth / 2; // top-left corner

        const tabR = H_NOTCH_RADIUS;
        const lip = (3 * strokeWidth) / 2;

        if (!this.input.hasLeftNotch) {
            return [`v ${-(edgeStart - edgeEnd)}`];
        }

        const notchBottom = NOTCH_OFFSET_Y + tabR + lip;
        const notchTop = NOTCH_OFFSET_Y - tabR - lip;

        // Fall back to a straight edge if the tab wouldn't fit between the two corners.
        if (notchBottom > edgeStart || notchTop < edgeEnd) {
            return [`v ${-(edgeStart - edgeEnd)}`];
        }

        return [
            `v ${-(edgeStart - notchBottom)}`, // 1. flat run up to where the tab begins
            `a ${lip} ${lip} 0 0 0 ${-lip} ${-lip}`, // 2. lip arc: peel the edge outwards (−x)
            `a ${tabR} ${tabR} 0 0 1 0 ${-2 * tabR}`, // 3. semicircle: the convex tab bulging out (−x)
            `a ${lip} ${lip} 0 0 0 ${lip} ${-lip}`, // 4. lip arc: bring the edge back in
            `v ${-(notchTop - edgeEnd)}`, // 5. remaining flat run up to the top-left corner
        ];
    }

    /**
     * Cavity roof segment, right → left.
     * Draws a smaller arc tab (hasNestedTopNotch) protruding DOWN into the cavity.
     * Width is reduced by 2*s so it fits inside the nested-bottom groove.
     *
     * @param strokeWidth        - Stroke width in SVG units
     * @param width              - Total outer width of the brick
     */
    private segTailCavityRoof(): string[] {
        const strokeWidth = this.input.strokeWidth;
        const width = this.dims.width;
        const span = width - TAIL_INDENT_W - strokeWidth;

        if (strokeWidth >= 2 * V_NOTCH_RADIUS) {
            return [`h ${-span}`];
        }

        // Tab centre aligns with the inner brick's top/bottom notch centre.
        const flatBefore =
            width - TAIL_INDENT_W - NOTCH_OFFSET_X - V_NOTCH_RADIUS - (3 * strokeWidth) / 2;
        const flatAfter = NOTCH_OFFSET_X - V_NOTCH_RADIUS + strokeWidth / 2;

        return [
            `h ${-flatBefore}`, // flat run to tab right edge
            ...this.buildVTab(),
            `h ${-flatAfter}`, // flat run to cavity left wall
        ];
    }

    private segTailCavityLeft(): string[] {
        const strokeWidth = this.input.strokeWidth;
        // Grows s/2 per seam: starts s/2 below the inset roof, ends s/2 above the inset floor.
        return [`v ${this.dims.nestHeight + strokeWidth / 2 + strokeWidth / 2}`];
    }

    /**
     * Cavity foot segment, left → right.
     * Draws a full-size arc groove cutting DOWN into the foot.
     * Full-size so it receives the inner brick's bottom tab.
     *
     * @param strokeWidth          - Stroke width in SVG units
     */
    private segTailFoot(): string[] {
        const strokeWidth = this.input.strokeWidth;
        const span = TAIL_STEP_W - TAIL_INDENT_W;

        const flatBefore = NOTCH_OFFSET_X - V_NOTCH_RADIUS - strokeWidth / 2;
        const flatAfter = span - NOTCH_OFFSET_X - V_NOTCH_RADIUS - (3 * strokeWidth) / 2;

        return [
            `h ${flatBefore}`, // flat run to groove left edge
            ...this.buildVGroove(),
            `h ${flatAfter}`, // flat run to step right wall
        ];
    }

    private segTailStepRight(): string[] {
        return [`v ${TAIL_STEP_H}`];
    }

    /**
     * Bottom of the tail step (nesting bricks only), right → left.
     * Draws a smaller arc tab protruding downward, same shape as segHeadBottom.
     *
     * @param strokeWidth    - Stroke width in SVG units
     * @param hasBottomNotch - Whether to draw the bottom notch tab
     */
    private segTailStepBottom(): string[] {
        const strokeWidth = this.input.strokeWidth;
        // No notch — single flat span going left.
        if (!this.input.hasBottomNotch) {
            return [`h ${-TAIL_STEP_W}`];
        }

        if (strokeWidth >= 2 * V_NOTCH_RADIUS) {
            return [`h ${-TAIL_STEP_W}`];
        }

        const flatBefore = TAIL_STEP_W - NOTCH_OFFSET_X - V_NOTCH_RADIUS + strokeWidth / 2;
        const flatAfter = NOTCH_OFFSET_X - V_NOTCH_RADIUS - strokeWidth / 2;

        return [
            `h ${-flatBefore}`, // flat run to tab right edge
            ...this.buildVTab(),
            `h ${-flatAfter}`, // flat run to step left wall
        ];
    }

    // ────────────────────────── Bounds ───────────────────────────────────────────────────────────────

    /**
     * Computes the bounding boxes for each visual region of a brick (label, nesting area,
     * params, and args), applying minimum dimension constraints and aligning each region
     * to its corresponding slot in the outline geometry.
     */
    private generateBounds(): BrickOutlineOutput['bounds'] {
        const { minLabelHeight, minNestHeight, minParamHeight, minArgHeight } = this.minimums;
        const input = this.input;
        const strokeWidth = input.strokeWidth;
        const { width, headHeight, nestHeight } = this.dims;

        const label: Bounds = {
            x: strokeWidth / 2 + HEAD_PAD_X1,
            y: strokeWidth / 2 + HEAD_PAD_Y1,
            w: input.labelDims.w,
            h: Math.max(input.labelDims.h, minLabelHeight),
        };

        let nesting: Bounds | undefined;
        if (this.input.hasNesting) {
            nesting = {
                x: TAIL_INDENT_W + strokeWidth / 2 + strokeWidth / 2,
                y: headHeight,
                w: input.nestingDims?.w ?? 0,
                h: Math.max(nestHeight, minNestHeight),
            };
        }

        const params: Bounds[] = [];
        const args: Bounds[] = [];
        let y = 0;

        for (const { param, arg } of input.paramArgDims) {
            const rowH = Math.max(arg?.h ?? 0, minArgHeight);

            if (arg !== null) {
                args.push({ x: width, y, w: arg.w, h: rowH });
            }

            if (param !== null) {
                const paramH = Math.max(param.h, minParamHeight);
                params.push({
                    x: width - strokeWidth / 2 - HEAD_PAD_X2 - param.w,
                    y: y + (rowH - paramH) / 2,
                    w: param.w,
                    h: paramH,
                });
            }

            y += rowH;
        }

        return {
            label,
            params: params.length > 0 ? params : undefined,
            args: args.length > 0 ? args : undefined,
            nesting,
        };
    }

    // ────────────────────────── Public API ───────────────────────────────────────────────────────────

    /**
     * Computes the SVG path and layout bounds for a single brick frame.
     *
     * @param input - Stroke width, label/param/arg dimensions, optional nesting,
     *               and optional topNotch / bottomNotch flags.
     * @returns SVG path string, outer frame dimensions, content-region bounds,
     *          and notch protrusion depths (for SVG viewBox sizing).
     */
    generate(input: BrickOutlineInput): BrickOutlineOutput {
        this.input = {
            ...input,
            hasNesting: input.nestingDims !== undefined,
            hasTopNotch: input.hasTopNotch ?? false,
            hasBottomNotch: input.hasBottomNotch ?? false,
            hasLeftNotch: input.hasLeftNotch ?? false,
        };
        this.computeDimensions(input);

        const argNotchCentreYs = this.computeArgNotchCentreYs();

        // Without nesting: top → right → bottom → left → close
        // With nesting:    top → right → cavityRoof → cavityLeft → foot → stepRight → stepBottom → left → close
        const segments = !this.input.hasNesting
            ? [
                  ...this.segTopEdge(),
                  ...this.segHeadRight(argNotchCentreYs),
                  ...this.segHeadBottom(),
                  ...this.segLeftEdge(),
                  'Z',
              ]
            : [
                  ...this.segTopEdge(),
                  ...this.segHeadRight(argNotchCentreYs),
                  ...this.segTailCavityRoof(),
                  ...this.segTailCavityLeft(),
                  ...this.segTailFoot(),
                  ...this.segTailStepRight(),
                  ...this.segTailStepBottom(),
                  ...this.segLeftEdge(),
                  'Z',
              ];

        const path = segments.join(' ');

        const bounds = this.generateBounds();

        return {
            path,
            width: this.dims.width,
            height: this.dims.height,
            bounds,
        };
    }
}
