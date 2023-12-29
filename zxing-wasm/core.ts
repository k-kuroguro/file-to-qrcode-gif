import { EmscriptenModule, EmscriptenModuleFactory } from "@types/emscripten";
import {
   defaultReaderOptions,
   defaultWriterOptions,
   readerOptionsToZXingReaderOptions,
   writerOptionsToZXingWriterOptions,
   zxingReadResultToReadResult,
   zxingWriteResultToWriteResult,
   type ReadResult,
   type ReaderOptions,
   type WriterOptions,
   type ZXingBinarizer,
   type ZXingCharacterSet,
   type ZXingContentType,
   type ZXingEanAddOnSymbol,
   type ZXingReadResult,
   type ZXingReaderOptions,
   type ZXingTextMode,
   type ZXingVector,
   type ZXingWriteResult,
   type ZXingWriterOptions,
} from "./bindings/index.ts";

export type ZXingModuleType = "reader" | "writer" | "full";

interface ZXingBaseModule extends EmscriptenModule {
   CharacterSet: ZXingCharacterSet;
}

/**
 * @internal
 */
export interface ZXingReaderModule extends ZXingBaseModule {
   Binarizer: ZXingBinarizer;
   ContentType: ZXingContentType;
   EanAddOnSymbol: ZXingEanAddOnSymbol;
   TextMode: ZXingTextMode;

   readBarcodesFromImage(
      bufferPtr: number,
      bufferLength: number,
      zxingReaderOptions: ZXingReaderOptions,
   ): ZXingVector<ZXingReadResult>;

   readBarcodesFromPixmap(
      bufferPtr: number,
      imgWidth: number,
      imgHeight: number,
      zxingReaderOptions: ZXingReaderOptions,
   ): ZXingVector<ZXingReadResult>;
}

/**
 * @internal
 */
export interface ZXingWriterModule extends ZXingBaseModule {
   writeBarcodeToImage(
      text: string,
      zxingWriterOptions: ZXingWriterOptions,
   ): ZXingWriteResult;
}

/**
 * @internal
 */
export interface ZXingFullModule extends ZXingReaderModule, ZXingWriterModule { }

export type ZXingModule<T extends ZXingModuleType = ZXingModuleType> =
   T extends "reader"
   ? ZXingReaderModule
   : T extends "writer"
   ? ZXingWriterModule
   : T extends "full"
   ? ZXingFullModule
   : ZXingReaderModule | ZXingWriterModule | ZXingFullModule;

export type ZXingReaderModuleFactory =
   EmscriptenModuleFactory<ZXingReaderModule>;
export type ZXingWriterModuleFactory =
   EmscriptenModuleFactory<ZXingWriterModule>;
export type ZXingFullModuleFactory = EmscriptenModuleFactory<ZXingFullModule>;

export type ZXingModuleFactory<T extends ZXingModuleType = ZXingModuleType> =
   T extends "reader"
   ? ZXingReaderModuleFactory
   : T extends "writer"
   ? ZXingWriterModuleFactory
   : T extends "full"
   ? ZXingFullModuleFactory
   :
   | ZXingReaderModuleFactory
   | ZXingWriterModuleFactory
   | ZXingFullModuleFactory;

export type ZXingModuleOverrides = Partial<EmscriptenModule>;

const defaultModuleOverrides: ZXingModuleOverrides = {
   locateFile: (path: string, prefix: string) => prefix + path,
};

interface ZXingWeakMapValue<T extends ZXingModuleType = ZXingModuleType> {
   moduleOverrides: ZXingModuleOverrides;
   modulePromise?: Promise<ZXingModule<T>>;
}

type ZXingWeakMap = WeakMap<ZXingModuleFactory, ZXingWeakMapValue>;

let zxingWeakMap: ZXingWeakMap = new WeakMap();

export function getZXingModuleWithFactory<T extends ZXingModuleType>(
   zxingModuleFactory: ZXingModuleFactory<T>,
   zxingModuleOverrides?: ZXingModuleOverrides,
): Promise<ZXingModule<T>> {
   const zxingWeakMapValue = zxingWeakMap.get(zxingModuleFactory) as
      | ZXingWeakMapValue<T>
      | undefined;

   if (
      zxingWeakMapValue?.modulePromise &&
      (zxingModuleOverrides === undefined ||
         Object.is(zxingModuleOverrides, zxingWeakMapValue.moduleOverrides))
   ) {
      return zxingWeakMapValue.modulePromise;
   }

   const resolvedModuleOverrides =
      zxingModuleOverrides ??
      zxingWeakMapValue?.moduleOverrides ??
      defaultModuleOverrides;

   const modulePromise = zxingModuleFactory({
      ...resolvedModuleOverrides,
   }) as Promise<ZXingModule<T>>;

   zxingWeakMap.set(zxingModuleFactory, {
      moduleOverrides: resolvedModuleOverrides,
      modulePromise,
   });

   return modulePromise;
}

export function purgeZXingModule() {
   zxingWeakMap = new WeakMap();
}

export function setZXingModuleOverridesWithFactory<T extends ZXingModuleType>(
   zxingModuleFactory: ZXingModuleFactory<T>,
   zxingModuleOverrides: ZXingModuleOverrides,
) {
   zxingWeakMap.set(zxingModuleFactory, {
      moduleOverrides: zxingModuleOverrides,
   });
}

export async function readBarcodesFromImageFileWithFactory<
   T extends "reader" | "full",
>(
   zxingModuleFactory: ZXingModuleFactory<T>,
   imageFile: Blob | File,
   readerOptions: ReaderOptions = defaultReaderOptions,
) {
   const requiredReaderOptions: Required<ReaderOptions> = {
      ...defaultReaderOptions,
      ...readerOptions,
   };
   const zxingModule = await getZXingModuleWithFactory(zxingModuleFactory);
   const { size } = imageFile;
   const buffer = new Uint8Array(await imageFile.arrayBuffer());
   const bufferPtr = zxingModule._malloc(size);
   zxingModule.HEAPU8.set(buffer, bufferPtr);
   const zxingReadResultVector = zxingModule.readBarcodesFromImage(
      bufferPtr,
      size,
      readerOptionsToZXingReaderOptions(zxingModule, requiredReaderOptions),
   );
   zxingModule._free(bufferPtr);
   const readResults: ReadResult[] = [];
   for (let i = 0; i < zxingReadResultVector.size(); ++i) {
      readResults.push(
         zxingReadResultToReadResult(zxingReadResultVector.get(i)!),
      );
   }
   return readResults;
}

export async function readBarcodesFromImageDataWithFactory<
   T extends "reader" | "full",
>(
   zxingModuleFactory: ZXingModuleFactory<T>,
   imageData: ImageData,
   readerOptions: ReaderOptions = defaultReaderOptions,
) {
   const requiredReaderOptions: Required<ReaderOptions> = {
      ...defaultReaderOptions,
      ...readerOptions,
   };
   const zxingModule = await getZXingModuleWithFactory(zxingModuleFactory);
   const {
      data: buffer,
      width,
      height,
      data: { byteLength: size },
   } = imageData;
   const bufferPtr = zxingModule._malloc(size);
   zxingModule.HEAPU8.set(buffer, bufferPtr);
   const zxingReadResultVector = zxingModule.readBarcodesFromPixmap(
      bufferPtr,
      width,
      height,
      readerOptionsToZXingReaderOptions(zxingModule, requiredReaderOptions),
   );
   zxingModule._free(bufferPtr);
   const readResults: ReadResult[] = [];
   for (let i = 0; i < zxingReadResultVector.size(); ++i) {
      readResults.push(
         zxingReadResultToReadResult(zxingReadResultVector.get(i)!),
      );
   }
   return readResults;
}

export async function writeBarcodeToImageFileWithFactory<
   T extends "writer" | "full",
>(
   zxingModuleFactory: ZXingModuleFactory<T>,
   text: string,
   writerOptions: WriterOptions = defaultWriterOptions,
) {
   const requiredWriterOptions: Required<WriterOptions> = {
      ...defaultWriterOptions,
      ...writerOptions,
   };
   const zxingModule = await getZXingModuleWithFactory(zxingModuleFactory);
   const zxingWriteResult = zxingModule.writeBarcodeToImage(
      text,
      writerOptionsToZXingWriterOptions(zxingModule, requiredWriterOptions),
   );
   return zxingWriteResultToWriteResult(zxingWriteResult);
}
