'use client';

import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth';
import { logout } from '@/lib/auth/actions';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function PendingApprovalPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);

  const handleCheckStatus = () => {
    setIsChecking(true);
    // Simply refresh the page - middleware will redirect if approved
    router.refresh();
    setTimeout(() => {
      window.location.href = '/';
    }, 500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
            <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-2xl font-bold">Pending Approval</CardTitle>
          <CardDescription className="text-base">
            Your account is awaiting approval from an administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            You&apos;ve successfully signed up with:
          </p>
          <p className="font-medium text-foreground">
            {user?.email || 'your email'}
          </p>
          <p className="text-sm text-muted-foreground">
            You&apos;ll be able to access the app once your account has been approved. 
            This usually happens within 24 hours.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            onClick={handleCheckStatus}
            variant="outline"
            className="w-full"
            disabled={isChecking}
          >
            {isChecking ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Check approval status
          </Button>
          <Button
            onClick={() => logout()}
            variant="ghost"
            className="w-full text-muted-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}








