import { useState, useEffect, useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { hasChineseText } from '@/lib/api';
import { Loader2, CircleHelp } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { ImageInput } from './ImageInput';
import { LogoA } from './LogoA';
import type { ParseInput } from '@/types';

const CHAR_LIMIT = 150;
const MIN_CHINESE_RATIO = 0.25;

// Example sentences for rotating placeholder
const EXAMPLE_SENTENCES = [
	'今天天气很好',
	'你好，请问...',
	'我想学中文',
	'这个多少钱？',
	'谢谢你的帮助',
];
const PLACEHOLDER_INTERVAL = 3500; // ms between sentence changes

interface InputViewProps {
	onSubmit: (input: ParseInput) => void;
	isLoading: boolean;
	onHelpClick: () => void;
}

export function InputView({ onSubmit, isLoading, onHelpClick }: InputViewProps) {
	const [text, setText] = useState('');
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const [isTextValid, setIsTextValid] = useState(false);

	// Rotating placeholder state
	const [placeholderIndex, setPlaceholderIndex] = useState(0);
	const [isPlaceholderVisible, setIsPlaceholderVisible] = useState(true);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const charCount = text.length;
	const isOverLimit = charCount > CHAR_LIMIT;

	// Text is valid if it meets the Chinese ratio and length requirements
	useEffect(() => {
		setIsTextValid(hasChineseText(text, MIN_CHINESE_RATIO) && !isOverLimit);
	}, [text, isOverLimit]);

	// Rotating placeholder animation
	useEffect(() => {
		// Only animate when textarea is empty and no image selected
		if (text || selectedImage) return;

		const interval = setInterval(() => {
			// Fade out
			setIsPlaceholderVisible(false);

			// After fade out, change text and fade in
			setTimeout(() => {
				setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_SENTENCES.length);
				setIsPlaceholderVisible(true);
			}, 300); // Match CSS transition duration
		}, PLACEHOLDER_INTERVAL);

		return () => clearInterval(interval);
	}, [text, selectedImage]);

	// Current placeholder text
	const currentPlaceholder = EXAMPLE_SENTENCES[placeholderIndex];

	// Can submit if we have valid text OR a selected image
	const canSubmit = (isTextValid || !!selectedImage) && !isLoading;

	const handleSubmit = () => {
		if (!canSubmit) return;

		if (selectedImage) {
			onSubmit({ type: 'image', image: selectedImage });
		} else {
			onSubmit({ type: 'text', sentence: text.trim() });
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		// Only allow Enter submit for text input (not when image is selected)
		if (e.key === 'Enter' && !e.shiftKey && !selectedImage) {
			e.preventDefault();
			handleSubmit();
		}
	};

	// Handle image selection - clear text when image is selected
	const handleImageSelect = (imageDataUrl: string | null) => {
		setSelectedImage(imageDataUrl);
		if (imageDataUrl) {
			setText(''); // Clear text when image is selected
		}
	};

	// Handle text change - clear image when text is entered
	const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setText(e.target.value);
		if (e.target.value && selectedImage) {
			setSelectedImage(null); // Clear image when text is entered
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center p-4 relative">
			{/* Header controls */}
			<div className="absolute top-4 right-4 flex items-center gap-1">
				<Button variant="ghost" size="icon" onClick={onHelpClick} title="Help">
					<CircleHelp className="size-5" />
				</Button>
				<ThemeToggle />
			</div>

			<Card className="w-full max-w-2xl">
				<CardContent className="p-6 space-y-4">
					{/* Logo and Title */}
					<div className="text-center space-y-3">
						{/* Logo */}
						<div className="flex justify-center">
							<LogoA size={56} />
						</div>

						{/* Gradient Title */}
						<h1
							className="text-3xl md:text-4xl font-bold tracking-tight"
							style={{
								background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
								WebkitBackgroundClip: 'text',
								WebkitTextFillColor: 'transparent',
								backgroundClip: 'text',
							}}
						>
							HanziLens
						</h1>

						<p className="text-sm text-muted-foreground">
							Break down Chinese sentences!
						</p>
					</div>

					{/* Text Input with animated placeholder */}
					<div className="relative">
						<Textarea
							ref={textareaRef}
							value={text}
							onChange={handleTextChange}
							onKeyDown={handleKeyDown}
							placeholder=""
							className="min-h-[150px] text-lg resize-none"
							disabled={isLoading || !!selectedImage}
						/>
						{/* Custom animated placeholder */}
						{!text && !selectedImage && (
							<div
								className="absolute top-2 left-2.5 pointer-events-none select-none transition-opacity duration-300"
								style={{ opacity: isPlaceholderVisible ? 1 : 0 }}
							>
								<span className="text-lg text-muted-foreground">{currentPlaceholder}</span>
							</div>
						)}
					</div>

					{/* Validation Messages (only show for text input) */}
					{!selectedImage && (
						<div className="flex flex-col gap-1">
							{/* Character count */}
							<div
								className={`text-sm text-right ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'
									}`}
							>
								{charCount}/{CHAR_LIMIT}
							</div>

							{/* Chinese ratio warning */}
							{text.length > 1 && !hasChineseText(text, MIN_CHINESE_RATIO) && (
								<div className="text-sm text-destructive">
									Please ensure at least 25% of text is Chinese characters
								</div>
							)}

							{/* Over limit warning */}
							{isOverLimit && (
								<div className="text-sm text-destructive">
									Maximum character limit exceeded ({CHAR_LIMIT} characters)
								</div>
							)}
						</div>
					)}

					{/* Image Input */}
					<ImageInput
						onImageSelect={handleImageSelect}
						disabled={isLoading}
						selectedImage={selectedImage}
					/>

					{/* Submit Button */}
					<Button
						onClick={handleSubmit}
						disabled={!canSubmit}
						className="w-full"
						size="lg"
					>
						{isLoading ? (
							<>
								<Loader2 className="size-4 animate-spin mr-2" />
								Analyzing...
							</>
						) : (
							'Go'
						)}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
