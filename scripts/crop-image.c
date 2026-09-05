#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <ImageIO/ImageIO.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static CFURLRef file_url(const char *path) {
    return CFURLCreateFromFileSystemRepresentation(
        kCFAllocatorDefault,
        (const UInt8 *)path,
        (CFIndex)strlen(path),
        false
    );
}

int main(int argc, const char *argv[]) {
    if (argc != 7) {
        fprintf(stderr, "Usage: crop-image <source> <destination> <x> <y> <width> <height>\n");
        return 1;
    }

    CFURLRef source_url = file_url(argv[1]);
    CFURLRef destination_url = file_url(argv[2]);
    CGImageSourceRef source = CGImageSourceCreateWithURL(source_url, NULL);
    CGImageRef image = source ? CGImageSourceCreateImageAtIndex(source, 0, NULL) : NULL;
    CGRect crop = CGRectMake(
        strtod(argv[3], NULL),
        strtod(argv[4], NULL),
        strtod(argv[5], NULL),
        strtod(argv[6], NULL)
    );
    CGImageRef cropped = image ? CGImageCreateWithImageInRect(image, crop) : NULL;
    CGImageDestinationRef destination = cropped
        ? CGImageDestinationCreateWithURL(destination_url, CFSTR("public.png"), 1, NULL)
        : NULL;

    bool written = false;
    if (destination) {
        CGImageDestinationAddImage(destination, cropped, NULL);
        written = CGImageDestinationFinalize(destination);
    }

    if (destination) CFRelease(destination);
    if (cropped) CGImageRelease(cropped);
    if (image) CGImageRelease(image);
    if (source) CFRelease(source);
    if (destination_url) CFRelease(destination_url);
    if (source_url) CFRelease(source_url);

    if (!written) {
        fprintf(stderr, "Unable to read, crop, or write the requested image.\n");
        return 1;
    }
    return 0;
}
