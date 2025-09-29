'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { IconArrowElbow } from '@/components/ui/icons';

export function ChatInput() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const { formRef, onKeyDown } = useEnterSubmit();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const message = input;
    setInput('');
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      
      router.refresh();
    } catch (error) {
      console.error('Error sending message:', error);
      // Handle error
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="relative flex max-h-60 w-full grow flex-col bg-background px-8 sm:rounded-md sm:border sm:px-12"
    >
      <Textarea
        ref={inputRef}
        tabIndex={0}
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Send a message..."
        spellCheck={false}
        className="min-h-[60px] w-full resize-none bg-transparent px-4 py-[1.3rem] focus-within:outline-none sm:text-sm"
        onKeyDown={onKeyDown}
      />
      <div className="absolute right-0 top-4 sm:right-4">
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim()}
          className="h-8 w-8"
        >
          <IconArrowElbow />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </form>
  );
}
