import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { adminService, User, RegisterRequest } from '@/services/services';
import { Loader2 } from 'lucide-react';

const createUserSchema = (isEditMode: boolean) => z.object({
  user_id: z.string().min(1, 'User ID is required'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  mobile: z.string().min(10, 'Mobile number must be at least 10 digits'),
  password: isEditMode 
    ? z.string().optional() 
    : z.string().min(6, 'Password must be at least 6 characters'),
  user_type: z.enum(['admin', 'moderator', 'player']),
  deposit_amount: z.number().min(0).optional(),
  alternate_mobile: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pin_code: z.string().optional(),
  region: z.string().optional(),
});

type UserFormData = z.infer<ReturnType<typeof createUserSchema>>;

interface UserFormProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
  onSuccess: () => void;
}

const UserForm: React.FC<UserFormProps> = ({ isOpen, onClose, user, onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isEditMode = !!user;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<UserFormData>({
    resolver: zodResolver(createUserSchema(isEditMode)),
    defaultValues: {
      user_type: 'player',
      deposit_amount: 0,
    },
  });

  const userType = watch('user_type');

  useEffect(() => {
    if (user) {
      // Edit mode - populate form with user data
      reset({
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        mobile: user.mobile,
        password: '', // Don't pre-fill password
        user_type: user.user_type,
        deposit_amount: user.deposit_amount || 0,
        alternate_mobile: user.alternate_mobile || '',
        address: user.address || '',
        city: user.city || '',
        state: user.state || '',
        pin_code: user.pin_code || '',
        region: user.region || '',
      });
    } else {
      // Create mode - reset form
      reset({
        user_id: '',
        first_name: '',
        last_name: '',
        email: '',
        mobile: '',
        password: '',
        user_type: 'player',
        deposit_amount: 0,
        alternate_mobile: '',
        address: '',
        city: '',
        state: '',
        pin_code: '',
        region: '',
      });
    }
  }, [user, reset]);

  const onSubmit = async (data: UserFormData) => {
    console.log('📝 Form submission started:', { isEditMode, data });
    setIsLoading(true);
    setError('');

    try {
      if (isEditMode && user) {
        // Update existing user - convert empty strings/undefined to null for optional fields
        const updateData: any = {
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          mobile: data.mobile,
          alternate_mobile: (data.alternate_mobile && data.alternate_mobile.trim()) ? data.alternate_mobile.trim() : null,
          address: (data.address && data.address.trim()) ? data.address.trim() : null,
          city: (data.city && data.city.trim()) ? data.city.trim() : null,
          state: (data.state && data.state.trim()) ? data.state.trim() : null,
          pin_code: (data.pin_code && data.pin_code.trim()) ? data.pin_code.trim() : null,
          region: (data.region && data.region.trim()) ? data.region.trim() : null,
          deposit_amount: data.deposit_amount !== undefined && data.deposit_amount !== null 
            ? Number(data.deposit_amount) || 0
            : 0,
        };
        console.log('🔄 Updating user:', user.id, updateData);
        const result = await adminService.updateUser(user.id.toString(), updateData);
        console.log('✅ User updated successfully:', result);
      } else {
        // Create new user - convert empty strings to null for optional fields
        const createData: RegisterRequest = {
          user_id: data.user_id,
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          mobile: data.mobile,
          password: data.password || '',
          user_type: data.user_type,
          deposit_amount: data.deposit_amount !== undefined && data.deposit_amount !== null 
            ? Number(data.deposit_amount) || 0
            : 0,
          alternate_mobile: (data.alternate_mobile && data.alternate_mobile.trim()) ? data.alternate_mobile.trim() : undefined,
          address: (data.address && data.address.trim()) ? data.address.trim() : undefined,
          city: (data.city && data.city.trim()) ? data.city.trim() : undefined,
          state: (data.state && data.state.trim()) ? data.state.trim() : undefined,
          pin_code: (data.pin_code && data.pin_code.trim()) ? data.pin_code.trim() : undefined,
          region: (data.region && data.region.trim()) ? data.region.trim() : undefined,
        };
        console.log('🆕 Creating user:', createData);
        const result = await adminService.createUser(createData);
        console.log('✅ User created successfully:', result);
      }

      console.log('🎉 Form submission successful, calling onSuccess');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('❌ Form submission error:', err);
      setError(err.response?.data?.message || 'Failed to save user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Edit User' : 'Create New User'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? 'Update user information below.' 
              : 'Fill in the details to create a new user account.'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user_id">User ID</Label>
              <Input
                id="user_id"
                {...register('user_id')}
                disabled={isEditMode}
                placeholder="Enter user ID"
              />
              {errors.user_id && (
                <p className="text-sm text-red-600">{errors.user_id.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="user_type">User Type</Label>
              <Select value={userType} onValueChange={(value) => setValue('user_type', value as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="moderator">Moderator</SelectItem>
                  <SelectItem value="player">Player</SelectItem>
                </SelectContent>
              </Select>
              {errors.user_type && (
                <p className="text-sm text-red-600">{errors.user_type.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                {...register('first_name')}
                placeholder="Enter first name"
              />
              {errors.first_name && (
                <p className="text-sm text-red-600">{errors.first_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                {...register('last_name')}
                placeholder="Enter last name"
              />
              {errors.last_name && (
                <p className="text-sm text-red-600">{errors.last_name.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder="Enter email address"
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile</Label>
              <Input
                id="mobile"
                {...register('mobile')}
                placeholder="Enter mobile number"
              />
              {errors.mobile && (
                <p className="text-sm text-red-600">{errors.mobile.message}</p>
              )}
            </div>
          </div>

          {!isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                {...register('password')}
                placeholder="Enter password"
              />
              {errors.password && (
                <p className="text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="alternate_mobile">Alternate Mobile</Label>
              <Input
                id="alternate_mobile"
                {...register('alternate_mobile')}
                placeholder="Enter alternate mobile"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deposit_amount">Wallet Balance</Label>
              <Input
                id="deposit_amount"
                type="number"
                {...register('deposit_amount', { valueAsNumber: true })}
                placeholder="Enter wallet balance"
                disabled={userType === 'admin'}
              />
              {userType === 'admin' && (
                <p className="text-sm text-gray-500">Wallet balance is not applicable for admin users</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              {...register('address')}
              placeholder="Enter address"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                {...register('city')}
                placeholder="Enter city"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                {...register('state')}
                placeholder="Enter state"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pin_code">Pin Code</Label>
              <Input
                id="pin_code"
                {...register('pin_code')}
                placeholder="Enter pin code"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">Region</Label>
            <Input
              id="region"
              {...register('region')}
              placeholder="Enter region"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditMode ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                isEditMode ? 'Update User' : 'Create User'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UserForm;
