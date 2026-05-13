import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, X, ImageIcon } from 'lucide-react';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface ImageInputProps {
	onImageSelect: (imageDataUrl: string | null) => void;
	disabled?: boolean;
	selectedImage: string | null;
}

/**
 * Detect if we're on a mobile device (for showing camera option)
 */
function isMobileDevice(): boolean {
	return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Convert a File to a base64 data URL
 */
async function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

/**
 * Validate and process an image file
 */
async function processImageFile(file: File): Promise<{ dataUrl: string } | { error: string }> {
	// Check file type
	if (!ALLOWED_TYPES.includes(file.type)) {
		return { error: `Unsupported file type. Please use JPEG, PNG, WebP, or GIF.` };
	}

	// Check file size
	if (file.size > MAX_FILE_SIZE_BYTES) {
		return { error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.` };
	}

	try {
		const dataUrl = await fileToDataUrl(file);
		return { dataUrl };
	} catch {
		return { error: 'Failed to read file.' };
	}
}

export function ImageInput({ onImageSelect, disabled, selectedImage }: ImageInputProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cameraInputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(null);
	const isMobile = isMobileDevice();

	// Handle file selection (from file picker or camera)
	const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setError(null);
		const result = await processImageFile(file);

		if ('error' in result) {
			setError(result.error);
			onImageSelect(null);
		} else {
			onImageSelect(result.dataUrl);
		}

		// Reset input so same file can be selected again
		e.target.value = '';
	}, [onImageSelect]);

	// Handle paste from clipboard
	const handlePaste = useCallback(async (e: ClipboardEvent) => {
		if (disabled) return;

		const items = e.clipboardData?.items;
		if (!items) return;

		for (const item of items) {
			if (item.type.startsWith('image/')) {
				e.preventDefault();
				const file = item.getAsFile();
				if (!file) continue;

				setError(null);
				const result = await processImageFile(file);

				if ('error' in result) {
					setError(result.error);
					onImageSelect(null);
				} else {
					onImageSelect(result.dataUrl);
				}
				break;
			}
		}
	}, [disabled, onImageSelect]);

	// Set up paste listener
	useEffect(() => {
		document.addEventListener('paste', handlePaste);
		return () => document.removeEventListener('paste', handlePaste);
	}, [handlePaste]);

	// Clear selected image
	const handleClear = () => {
		setError(null);
		onImageSelect(null);
	};

	// Trigger file input click
	const handleUploadClick = () => {
		fileInputRef.current?.click();
	};

	// Trigger camera input click
	const handleCameraClick = () => {
		cameraInputRef.current?.click();
	};

	return (
		<div className="space-y-3">
			{/* Hidden file inputs */}
			<input
				ref={fileInputRef}
				type="file"
				accept={ALLOWED_TYPES.join(',')}
				onChange={handleFileChange}
				className="hidden"
				disabled={disabled}
			/>
			{isMobile && (
				<input
					ref={cameraInputRef}
					type="file"
					accept="image/*"
					capture="environment"
					onChange={handleFileChange}
					className="hidden"
					disabled={disabled}
				/>
			)}

			{/* Image preview or buttons */}
			{selectedImage ? (
				<div className="relative">
					<div className="relative rounded-lg overflow-hidden border bg-muted">
						<img
							src={selectedImage}
							alt="Selected image"
							className="w-full max-h-48 object-contain"
						/>
						<Button
							variant="destructive"
							size="icon"
							className="absolute top-2 right-2 h-8 w-8"
							onClick={handleClear}
							disabled={disabled}
						>
							<X className="h-4 w-4" />
						</Button>
					</div>
					<p className="text-xs text-muted-foreground mt-1 text-center">
						Image ready to analyze
					</p>
				</div>
			) : (
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<div className="flex-1 h-px bg-border" />
						<span className="text-xs text-muted-foreground px-2">or analyze an image</span>
						<div className="flex-1 h-px bg-border" />
					</div>

					<div className="flex gap-2">
						{isMobile ? (
							<>
								<Button
									variant="outline"
									className="flex-1"
									onClick={handleCameraClick}
									disabled={disabled}
								>
									<Camera className="h-4 w-4 mr-2" />
									Take Photo
								</Button>
								<Button
									variant="outline"
									className="flex-1"
									onClick={handleUploadClick}
									disabled={disabled}
								>
									<ImageIcon className="h-4 w-4 mr-2" />
									Photo Library
								</Button>
							</>
						) : (
							<Button
								variant="outline"
								className="w-full"
								onClick={handleUploadClick}
								disabled={disabled}
							>
								<Upload className="h-4 w-4 mr-2" />
								Upload Image
							</Button>
						)}
					</div>

					{!isMobile && (
						<p className="text-xs text-muted-foreground text-center">
							Paste an image with Command/Ctrl+V
						</p>
					)}
				</div>
			)}

			{/* Error message */}
			{error && (
				<p className="text-sm text-destructive text-center">{error}</p>
			)}
		</div>
	);
}
