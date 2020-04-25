import {LedColor} from './color';
import {padMatrix, chopMatrix, appendMatrices, MatrixPaddingOption, createMatrix, getPadDifference} from './matrix';
import {init, drawFrame} from './draw';
import {overrideDefinedProperties} from './util/object';
import {EventEmitter} from 'events';

/**
 * Options for scrolling.
 */
export type DrawScrollOptions = Partial<{
    /**
     * scroll this number of times before stopping. -1 indicates it should never stop
     * default is -1
     */
    scrollCount: number;
    /**
     * delay in milliseconds between each pixel increment of the scroll
     * default is 100
     */
    frameDelayMs: number;
    /**
     * delay in milliseconds between each full loop
     * defaults to 0
     */
    loopDelayMs: number;
    /**
     * options for padding the given image
     * default is MatrixPaddingOption.LEFT
     */
    padding: MatrixPaddingOption;
    /**
     * color for the padding created by the the padding or the emptyFrameBetweenLoops properties
     * default is LedColor.BLACK
     */
    padBackgroundColor: LedColor;
    /**
     * causes each loop to end with padding the width of the whole LED matrix
     * useful for looping text so that the loop position is obvious
     * default is false
     */
    emptyFrameBetweenLoops: boolean;
    /**
     * chooses the direction of scrolling, to the left or to the right
     * default is 'left'
     */
    scrollDirection: 'left' | 'right';
}>;

const defaultScrollOptions: Required<DrawScrollOptions> = {
    scrollCount: -1, // -1 means infinite
    frameDelayMs: 100,
    loopDelayMs: 0,
    padding: MatrixPaddingOption.LEFT,
    padBackgroundColor: LedColor.BLACK,
    emptyFrameBetweenLoops: false,
    scrollDirection: 'left',
};

/**
 * stop event: emit this to stop the scrolling
 *
 * done event: listen to this to know when the scrolling is done
 * loop event: listen to this to know when the scroll loops (and how many times it has looped)
 */
export interface ScrollEmitter extends EventEmitter {
    emit(type: 'stop'): boolean;

    on(type: 'done', listener: () => void): this;
    once(type: 'done', listener: () => void): this;

    on(type: 'loop', listener: (count: number) => void): this;
    once(type: 'loop', listener: (count: number) => void): this;
}

// for internal use only
interface InternalScrollingEventEmitter extends EventEmitter {
    on(type: 'stop', listener: () => void): this;

    emit(type: 'done'): boolean;

    emit(type: 'loop', count: number): boolean;
}

/**
 * Scrolls an image (color matrix) horizontally leftwards across the LED display
 *
 * @param matrix                     color matrix to scroll
 * @param width                      width of the LED display
 * @param brightness                 set the LED brightness
 * @param rawInputScrollOptions      options for scrolling, see DrawScrollOptions type for available options
 */
export function drawScrollingImage(
    width: number,
    brightness: number,
    matrix: LedColor[][],
    rawInputScrollOptions: DrawScrollOptions = {},
): ScrollEmitter {
    const emitter = new EventEmitter() as InternalScrollingEventEmitter;

    const options: Required<DrawScrollOptions> = overrideDefinedProperties(defaultScrollOptions, rawInputScrollOptions);
    let fullMatrix = matrix;

    if (options.padding === MatrixPaddingOption.NONE) {
        // append the image itself until it fills the display
        while (fullMatrix[0].length < width) {
            fullMatrix = appendMatrices(fullMatrix, matrix);
        }
    } else {
        fullMatrix = padMatrix(matrix, width, options.padBackgroundColor, options.padding);
    }

    if (options.emptyFrameBetweenLoops) {
        const {left, right} = getPadDifference(matrix, width, options.padding);
        switch (options.scrollDirection) {
            case 'left':
                fullMatrix = appendMatrices(
                    // subtract the padding so that we have a MAX of one frame of spacing with the padding included
                    createMatrix(matrix.length, width - left, options.padBackgroundColor),
                    fullMatrix,
                );
                break;
            case 'right':
                fullMatrix = appendMatrices(
                    fullMatrix,
                    createMatrix(matrix.length, width - right, options.padBackgroundColor),
                );
                break;
        }
    }

    const startingIndex = options.scrollDirection === 'left' ? 0 : fullMatrix[0].length - 1;
    const increment = options.scrollDirection === 'left' ? 1 : -1;

    let keepScrolling = true;
    emitter.on('stop', () => {
        keepScrolling = false;
    });

    init(matrix.length, width, brightness);

    function innerDrawScrollingString(pixelIndex: number, currentScrollLoop: number) {
        if (keepScrolling) {
            drawFrame(
                chopMatrix(
                    // append the matrix to itself to make sure it never clips
                    appendMatrices(fullMatrix, fullMatrix),
                    pixelIndex,
                    width,
                ),
            );
            // still within current loop
            if (
                (pixelIndex < fullMatrix[0].length && options.scrollDirection === 'left') ||
                (pixelIndex >= 0 && options.scrollDirection === 'right')
            ) {
                // pause on the first frame of the first loop
                if (pixelIndex === startingIndex && currentScrollLoop === 0) {
                    setTimeout(() => {
                        innerDrawScrollingString(pixelIndex + increment, currentScrollLoop);
                    }, options.loopDelayMs);
                }
                // don't pause on any other frames
                else {
                    setTimeout(() => {
                        innerDrawScrollingString(pixelIndex + increment, currentScrollLoop);
                    }, options.frameDelayMs);
                }
            }
            // current loop is over
            else {
                // there shouldn't be another loop
                // note that options.scrollCount < 0 indicates that it should loop forever
                if (options.scrollCount >= 0 && currentScrollLoop + increment >= options.scrollCount) {
                    keepScrolling = false;
                }
                // the next loop should start
                else {
                    emitter.emit('loop', currentScrollLoop);
                }
                setTimeout(() => {
                    innerDrawScrollingString(startingIndex, currentScrollLoop + increment);
                }, options.loopDelayMs);
            }
        } else {
            emitter.emit('done');
        }
    }

    innerDrawScrollingString(startingIndex, 0);
    // the exported value should only be of the public interface
    return (emitter as any) as ScrollEmitter;
}
